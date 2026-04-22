// ─────────────────────────────────────────────
// Knowledge Chunks
//
// 検索対象本文 (chunks) の interface 定義と NocoDB mapper。
//
// 想定テーブル: support_ai_knowledge_chunks
//
// 設計方針:
//   - Help Center / Notion FAQ / CSE を同じ retrieval で扱う
//   - source_type で出所を区別し、policy-gate.js で顧客返答可否を判定する
//   - 現フェーズではテーブルが存在しない場合も安全に空配列を返す
//   - 将来 sync job が chunks を populate したら自動で使えるようになる
//
// 推奨テーブル構成 (NocoDB に作る際の参考):
//   chunk_id          TEXT  PRIMARY KEY
//   source_name       TEXT  (例: "ptengine_help_center", "notion_faq")
//   source_type       TEXT  (help_center / notion_faq / notion_cse / known_issue)
//   origin_record_id  TEXT  (元レコードの NocoDB Id または URL パス)
//   title             TEXT
//   body              TEXT  (検索・LLM 参照用の本文)
//   url               TEXT  (顧客に案内できる URL)
//   tags              TEXT  (カンマ区切りまたは JSON 配列)
//   published_to_bot  BOOL  (顧客返答に使用可なら true)
//   reusable          BOOL  (反復利用に適した汎用コンテンツなら true)
//   freshness_score   NUM   (0.0〜1.0: 高いほど新鮮)
//   updated_at        DATETIME
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { listRecords } from "../nocodb.js";

const TABLE_ID = process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID ?? "";

/**
 * @typedef {Object} KnowledgeChunk
 * @property {string} chunk_id
 * @property {string} source_name
 * @property {string} source_type
 * @property {string} origin_record_id
 * @property {string} title
 * @property {string} body
 * @property {string|null} url
 * @property {string[]} tags
 * @property {boolean} published_to_bot
 * @property {boolean} is_active    NocoDB カラムとして存在するが retrieval では現在未使用 (published_to_bot が主ゲート)
 * @property {boolean} reusable
 * @property {number} freshness_score
 * @property {string|null} updated_at
 */

/**
 * source_type と検索クエリでチャンクを検索する。
 * テーブル未設定・取得失敗は空配列を返す。
 *
 * @param {{ sourceTypes?: string[], query?: string, limit?: number }} opts
 * @returns {Promise<KnowledgeChunk[]>}
 */
export async function searchChunks({ sourceTypes, query, limit = 10 }) {
  if (!TABLE_ID) return [];

  const filters = ["(published_to_bot,eq,true)"];
  if (sourceTypes?.length === 1) {
    filters.push(`(source_type,eq,${sourceTypes[0]})`);
  }

  try {
    // 全件取得してクライアント側でスコアリング (テーブルが ≤ 500 件想定)
    const data = await listRecords(TABLE_ID, {
      where: filters.join("~and"),
      limit: 200,
      sort: "-freshness_score"
    });
    const all = (data?.list ?? []).map(normalizeChunk);
    if (!query || all.length === 0) return all.slice(0, limit);
    return scoreAndRankChunks(all, query).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * キーワードマッチスコアでチャンクを並べ替える。
 * NocoDB が全文検索をサポートしないためクライアント側で実施する。
 *
 * @param {KnowledgeChunk[]} chunks
 * @param {string} query
 * @returns {KnowledgeChunk[]}
 */
function scoreAndRankChunks(chunks, query) {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return chunks;

  return chunks
    .map((c) => {
      const haystack = `${c.title} ${c.tags.join(" ")} ${c.body.slice(0, 400)}`;
      const score = keywords.reduce((sum, kw) => sum + (haystack.includes(kw) ? 1 : 0), 0);
      return { c, score };
    })
    .sort((a, b) => b.score - a.score || b.c.freshness_score - a.c.freshness_score)
    .map(({ c }) => c);
}

/**
 * クエリ文字列からマッチング用キーワードを抽出する。
 * - 短い語 (≤10) はそのまま
 * - 長い語は日本語助詞で分割してキーワード抽出 + 先頭6文字を追加
 * - 丁寧語 (されません→されない) を正規化して FAQ の普通体表現にマッチさせる
 *
 * @param {string} query
 * @returns {string[]}
 */
function extractKeywords(query) {
  const seen = new Set();
  const result = [];
  const add = (kw) => {
    const k = kw.trim();
    if (k.length >= 2 && !seen.has(k)) { seen.add(k); result.push(k); }
    // 丁寧語 → 普通体 の正規化バージョンも追加
    const normalized = normalizePoliteNegation(k);
    if (normalized !== k && !seen.has(normalized)) { seen.add(normalized); result.push(normalized); }
  };

  for (const part of query.split(/\s+/)) {
    const clean = part.replace(/[、。？！「」（）]/g, "").trim();
    if (clean.length < 2) continue;

    if (clean.length <= 10) {
      add(clean);
    } else {
      // 助詞で分割して名詞句を抽出 (例: "ポップアップが表示されません" → ["ポップアップ", "表示されません"])
      const segs = clean.split(/[がはをにでとのもてか]+/).filter((s) => s.length >= 2);
      segs.slice(0, 3).forEach(add);
      add(clean.slice(0, 6)); // 先頭6文字もフォールバック
    }
  }
  return result;
}

/**
 * 丁寧否定形 (〜ません) を普通体否定 (〜ない) に変換する。
 * FAQ タイトルが普通体のため、ユーザーの丁寧語との不一致を解消する。
 *
 * @param {string} text
 * @returns {string}
 */
function normalizePoliteNegation(text) {
  return text
    .replace(/されません/g, "されない")
    .replace(/できません/g, "できない")
    .replace(/ません/g, "ない");
}

/**
 * origin_record_id で特定チャンクを取得する。
 *
 * @param {string} originRecordId
 * @returns {Promise<KnowledgeChunk|null>}
 */
export async function getChunkByOriginId(originRecordId) {
  if (!TABLE_ID) return null;
  try {
    const data = await listRecords(TABLE_ID, {
      where: `(origin_record_id,eq,${originRecordId})`,
      limit: 1
    });
    const row = data?.list?.[0];
    return row ? normalizeChunk(row) : null;
  } catch {
    return null;
  }
}

/**
 * NocoDB の行を KnowledgeChunk 形式に正規化する。
 */
export function normalizeChunk(row) {
  let tags = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags;
  } else if (typeof row.tags === "string" && row.tags.trim()) {
    try { tags = JSON.parse(row.tags); } catch { tags = row.tags.split(",").map((t) => t.trim()).filter(Boolean); }
  }

  return {
    chunk_id: String(row.chunk_id ?? row.Id ?? ""),
    source_name: row.source_name ?? "",
    source_type: row.source_type ?? "",
    origin_record_id: row.origin_record_id ?? "",
    title: row.title ?? "",
    body: row.body ?? "",
    url: row.url ?? null,
    tags,
    published_to_bot: Boolean(row.published_to_bot),
    is_active: Boolean(row.is_active),
    reusable: Boolean(row.reusable),
    freshness_score: typeof row.freshness_score === "number" ? row.freshness_score : 0.5,
    updated_at: row.updated_at ?? null
  };
}

/**
 * テーブル設定が有効かどうかを確認する。
 */
export function isChunksTableEnabled() {
  return Boolean(TABLE_ID);
}
