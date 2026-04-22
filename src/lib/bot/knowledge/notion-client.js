// Notion API client (native fetch, no SDK)

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function notionHeaders() {
  const token = process.env.NOTION_API_TOKEN;
  if (!token) throw new Error("NOTION_API_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}

async function notionFetch(path, options = {}) {
  const res = await fetch(`${NOTION_API_BASE}${path}`, {
    ...options,
    headers: { ...notionHeaders(), ...(options.headers ?? {}) }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Notion API error (${res.status}) ${path}: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Notion データベースの全ページを取得する (pagination 込み)。
 * @param {string} databaseId
 * @param {{ filter?: object }} opts
 * @returns {Promise<object[]>}
 */
export async function queryDatabase(databaseId, opts = {}) {
  const pages = [];
  let cursor;

  do {
    const body = { page_size: 100 };
    if (opts.filter) body.filter = opts.filter;
    if (cursor) body.start_cursor = cursor;

    const res = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body)
    });

    pages.push(...(res.results ?? []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages;
}

// ─── body 抽出 ───────────────────────────────────────────────────────────────

/**
 * Notion FAQ ページのプロパティから本文を構築する。
 *
 * Ptengine FAQ DB の構造:
 *   - ページブロックは空 (block count = 0)
 *   - 本文はすべて rich_text プロパティに格納されている
 *
 * 優先順位: 解決方法 > 原因説明 > 質問の詳細 > トラブルシューティングガイド > Keywords
 */
export function buildBodyFromProperties(page) {
  const parts = [];

  const fields = [
    { prop: "質問の詳細",                label: "Q" },
    { prop: "解決方法",                   label: "A" },
    { prop: "原因説明",                   label: "原因" },
    { prop: "トラブルシューティングガイド", label: "手順" },
    { prop: "Keywords",                   label: "キーワード" }
  ];

  for (const { prop, label } of fields) {
    const text = getRichTextProp(page, prop);
    if (text) parts.push(`${label}: ${text}`);
  }

  return parts.join("\n");
}

/**
 * ページのブロック本文を取得する (ブロックに本文がある場合の fallback)。
 * Ptengine FAQ DB ではブロックが空のため通常は空文字を返す。
 */
export async function getPageText(blockId, maxDepth = 2) {
  const lines = await collectBlockText(blockId, maxDepth, 0);
  return lines.join("\n").trim();
}

async function collectBlockText(blockId, maxDepth, depth) {
  if (depth > maxDepth) return [];

  const lines = [];
  let cursor;

  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const res = await notionFetch(`/blocks/${blockId}/children${qs}`);

    for (const block of res.results ?? []) {
      const text = extractBlockText(block);
      if (text) lines.push(text);

      if (block.has_children && depth < maxDepth) {
        const childLines = await collectBlockText(block.id, maxDepth, depth + 1);
        lines.push(...childLines);
      }
    }

    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return lines;
}

function extractBlockText(block) {
  const type = block.type;
  const content = block[type];
  if (!content) return "";

  const richTextTypes = [
    "paragraph", "heading_1", "heading_2", "heading_3",
    "bulleted_list_item", "numbered_list_item", "to_do",
    "toggle", "quote", "callout", "code"
  ];

  if (richTextTypes.includes(type)) {
    return richTextToString(content.rich_text ?? []);
  }
  return "";
}

// ─── プロパティ取得ユーティリティ ─────────────────────────────────────────────

function richTextToString(richTexts) {
  return richTexts.map((r) => r.plain_text ?? "").join("").trim();
}

function getRichTextProp(page, propName) {
  const prop = page.properties?.[propName];
  if (!prop || prop.type !== "rich_text") return "";
  return richTextToString(prop.rich_text ?? []);
}

/**
 * Notion ページから published_to_bot を解決する。
 *
 * 解決順:
 *   1. Notion プロパティ "published_to_bot" (checkbox) が存在 → その値を使う
 *   2. プロパティが存在しない → defaultValue を使う
 *
 * @param {object} page
 * @param {boolean} defaultValue  プロパティ未設定時のデフォルト値
 * @returns {{ value: boolean, source: "notion_property"|"default" }}
 */
export function resolvePublishedToBot(page, defaultValue = true) {
  const prop =
    page.properties?.published_to_bot ??
    page.properties?.Published_to_bot ??
    page.properties?.PublishedToBot;

  if (prop?.type === "checkbox") {
    return { value: Boolean(prop.checkbox), source: "notion_property" };
  }
  return { value: defaultValue, source: "default" };
}

/**
 * 後方互換: published_to_bot の boolean 値のみ返す。
 * デフォルト値は環境変数 NOTION_FAQ_DEFAULT_PUBLISHED_TO_BOT で制御 (デフォルト: true)。
 */
export function getPublishedToBot(page) {
  const defaultValue = process.env.NOTION_FAQ_DEFAULT_PUBLISHED_TO_BOT !== "false";
  return resolvePublishedToBot(page, defaultValue).value;
}

/**
 * ページの title プロパティを取得する。
 */
export function getPageTitle(page) {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title") {
      return richTextToString(prop.title ?? []);
    }
  }
  return "";
}

/**
 * ページのタグを取得する。
 * L1_機能 / L2_現象 / L3_原因分類 / tags / Tags の multi_select を統合する。
 */
export function getPageTags(page) {
  const tags = new Set();
  const tagPropNames = ["L1_機能", "L2_現象", "L3_原因分類", "tags", "Tags"];

  for (const name of tagPropNames) {
    const prop = page.properties?.[name];
    if (!prop) continue;
    if (prop.type === "multi_select") {
      for (const t of prop.multi_select ?? []) tags.add(t.name);
    } else if (prop.type === "select" && prop.select) {
      tags.add(prop.select.name);
    }
  }
  return Array.from(tags);
}

/**
 * ページの URL を取得する。
 * 「関連リンク」→「URL」→「url」の順で探す。
 */
export function getPageUrl(page) {
  const urlPropNames = ["関連リンク", "URL", "url"];
  for (const name of urlPropNames) {
    const prop = page.properties?.[name];
    if (prop?.type === "url" && prop.url) return prop.url;
  }
  return null;
}
