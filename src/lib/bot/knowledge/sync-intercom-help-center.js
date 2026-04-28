// Intercom Help Center → support_ai_knowledge_chunks 同期ロジック
//
// Intercom Articles API (GET /articles) で全記事を取得し、
// published 状態のものを knowledge_chunks テーブルに upsert する。
//
// source_type: "help_center"
// published_to_bot: true (全公開記事を顧客返答に使用可とする)
//
// フォールバック: チャンクが空の場合は help-center-answer.js がオンデマンドスクレイピングに切り替える。

import { listRecords, createRecord, updateRecord } from "../nocodb.js";
import { config } from "../config.js";

const SOURCE_NAME = "ptengine_help_center";
const SOURCE_TYPE = "help_center";
const MAX_ARTICLE_CHARS = 3000;
const FETCH_TIMEOUT_MS = 15000;
const PER_PAGE = 50;

function getChunksTableId() {
  return process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID ?? "";
}

function getSourcesTableId() {
  return config.nocodb?.tables?.knowledgeSources ?? "";
}

export function buildChunkId(articleId) {
  return `help_center_${articleId}`;
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ARTICLE_CHARS);
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Intercom Articles API から全記事を取得する (ページネーション対応)。
 * @returns {Promise<Array>}
 */
async function fetchAllArticles() {
  const baseUrl = config.intercom.apiBaseUrl;
  const headers = {
    "Authorization": `Bearer ${config.intercom.accessToken}`,
    "Accept": "application/json"
  };

  const articles = [];
  let page = 1;

  while (true) {
    const url = `${baseUrl}/articles?page=${page}&per_page=${PER_PAGE}`;
    const res = await fetchWithTimeout(url, { headers });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Intercom API error (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const batch = data?.data ?? [];
    articles.push(...batch);

    const totalPages = data?.pages?.total_pages ?? 1;
    if (page >= totalPages || batch.length === 0) break;
    page++;
  }

  return articles;
}

async function findExistingChunk(tableId, chunkId) {
  try {
    const data = await listRecords(tableId, {
      where: `(chunk_id,eq,${chunkId})`,
      limit: 1
    });
    return data?.list?.[0] ?? null;
  } catch {
    return null;
  }
}

async function upsertChunk(tableId, chunk) {
  const existing = await findExistingChunk(tableId, chunk.chunk_id);
  if (existing) {
    await updateRecord(tableId, existing.Id, chunk);
    return "updated";
  }
  await createRecord(tableId, chunk);
  return "created";
}

async function ensureSourceRegistered(sourcesTableId) {
  let existing = null;
  try {
    const data = await listRecords(sourcesTableId, {
      where: "(source_type,eq,help_center)",
      limit: 1
    });
    existing = data?.list?.[0] ?? null;
  } catch {}

  const now = new Date().toISOString();
  if (existing) {
    await updateRecord(sourcesTableId, existing.Id, {
      last_synced_at: now,
      freshness_status: "fresh"
    });
  } else {
    await createRecord(sourcesTableId, {
      source_name: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      source_url_or_path: "https://helps.ptengine.com",
      is_active: true,
      freshness_status: "fresh",
      last_synced_at: now
    });
  }
}

/**
 * Intercom Help Center 記事 → NocoDB knowledge_chunks の同期を実行する。
 *
 * @returns {{ fetched: number, created: number, updated: number, skipped: number, failed: number }}
 */
export async function syncIntercomHelpCenter() {
  const chunksTableId = getChunksTableId();
  if (!chunksTableId) throw new Error("NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID is not set");
  if (!config.intercom.accessToken) throw new Error("INTERCOM_ACCESS_TOKEN is not set");

  console.log("[sync-hc] Intercom Help Center sync 開始");

  let articles;
  try {
    articles = await fetchAllArticles();
  } catch (err) {
    throw new Error(`Help Center 記事取得失敗: ${err.message}`);
  }

  console.log(`[sync-hc] ${articles.length} 件取得`);

  const stats = { fetched: articles.length, created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const article of articles) {
    if (article.state !== "published") {
      console.log(`[sync-hc] skip (unpublished) id=${article.id} title="${article.title}"`);
      stats.skipped++;
      continue;
    }

    const body = stripHtml(article.body);

    if (!article.title && !body) {
      console.log(`[sync-hc] skip (empty) id=${article.id}`);
      stats.skipped++;
      continue;
    }

    const updatedAt = article.updated_at
      ? new Date(article.updated_at * 1000).toISOString()
      : new Date().toISOString();

    const chunkId = buildChunkId(article.id);
    const chunk = {
      chunk_id: chunkId,
      source_name: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      origin_record_id: String(article.id),
      title: article.title ?? "",
      body,
      url: article.url ?? null,
      tags: JSON.stringify([]),
      published_to_bot: true,
      is_active: true,
      reusable: true,
      freshness_score: 0.85,
      updated_at: updatedAt
    };

    try {
      const result = await upsertChunk(chunksTableId, chunk);
      stats[result]++;
      console.log(`[sync-hc] ${result} ${chunkId} "${article.title}" body_len=${body.length}`);
    } catch (err) {
      console.warn(`[sync-hc] upsert 失敗 ${chunkId}: ${err.message}`);
      stats.failed++;
    }
  }

  const sourcesTableId = getSourcesTableId();
  if (sourcesTableId) {
    try {
      await ensureSourceRegistered(sourcesTableId);
      console.log("[sync-hc] knowledge_sources 更新完了");
    } catch (err) {
      console.warn(`[sync-hc] knowledge_sources 更新失敗 (非致命的): ${err.message}`);
    }
  }

  console.log(
    `[sync-hc] 完了: fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed}`
  );

  return stats;
}
