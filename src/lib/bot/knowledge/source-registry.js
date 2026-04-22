// ─────────────────────────────────────────────
// Knowledge Source Registry
//
// NocoDB の support_ai_knowledge_sources テーブルをラップして
// 利用可能な知識ソース一覧を返す。
//
// source_type 一覧:
//   help_center  — Ptengine 公開 Help Center (顧客返答可)
//   notion_faq   — 社内 Notion FAQ DB (published_to_bot=true のみ顧客返答可)
//   notion_cse   — 社内 CSE 対応事例 (内部補助のみ・顧客返答不可)
//   known_issue  — 既知バグ・制約 (published_to_bot=true のみ顧客返答可)
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { listRecords } from "../nocodb.js";

const TABLE_ID = config.nocodb?.tables?.knowledgeSources ?? "";

/**
 * @typedef {Object} KnowledgeSource
 * @property {string} id
 * @property {string} source_name
 * @property {string} source_type
 * @property {string|null} url
 * @property {boolean} is_active
 * @property {boolean} published_to_bot
 * @property {string|null} description
 * @property {string|null} sync_schedule
 * @property {string|null} last_synced_at
 */

/**
 * 全アクティブな知識ソース一覧を返す。
 * テーブルが未設定・取得失敗の場合は空配列を返す (bot 全体は落とさない)。
 *
 * @returns {Promise<KnowledgeSource[]>}
 */
export async function listActiveSources() {
  if (!TABLE_ID) return [];
  try {
    const data = await listRecords(TABLE_ID, {
      where: "(is_active,eq,true)",
      limit: 50
    });
    return (data?.list ?? []).map(normalizeSource);
  } catch {
    return [];
  }
}

/**
 * 指定した source_type のアクティブソース一覧を返す。
 *
 * @param {string} sourceType
 * @returns {Promise<KnowledgeSource[]>}
 */
export async function listSourcesByType(sourceType) {
  if (!TABLE_ID) return [];
  try {
    const data = await listRecords(TABLE_ID, {
      where: `(is_active,eq,true)~and(source_type,eq,${sourceType})`,
      limit: 20
    });
    return (data?.list ?? []).map(normalizeSource);
  } catch {
    return [];
  }
}

/**
 * NocoDB の行を KnowledgeSource 形式に正規化する。
 */
function normalizeSource(row) {
  return {
    id: String(row.Id ?? row.id ?? ""),
    source_name: row.source_name ?? row.name ?? "",
    source_type: row.source_type ?? "",
    url: row.url ?? null,
    is_active: Boolean(row.is_active),
    published_to_bot: Boolean(row.published_to_bot),
    description: row.description ?? null,
    sync_schedule: row.sync_schedule ?? null,
    last_synced_at: row.last_synced_at ?? null
  };
}

/**
 * テーブル設定が有効かどうかを確認する。
 * テスト・デバッグ用。
 */
export function isSourceRegistryEnabled() {
  return Boolean(TABLE_ID);
}
