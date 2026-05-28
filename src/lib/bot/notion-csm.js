// ─────────────────────────────────────────────
// notion-csm.js
//
// Notion の CSM 顧客管理データベースから顧客フェーズ情報を取得する。
// Intercom コンタクトのメールアドレスをキーに検索する。
//
// 環境変数:
//   NOTION_CSM_DATABASE_ID  — CSM 顧客管理 Notion DB の ID (必須)
//   NOTION_CSM_EMAIL_PROP   — メール列のプロパティ名 (デフォルト: "Email")
//   NOTION_CSM_PHASE_PROP   — フェーズ列のプロパティ名 (デフォルト: "フェーズ")
// ─────────────────────────────────────────────

import { queryDatabase } from "./knowledge/notion-client.js";
import { logger } from "./logger.js";

const EMAIL_PROP = process.env.NOTION_CSM_EMAIL_PROP ?? "Email";
const PHASE_PROP = process.env.NOTION_CSM_PHASE_PROP ?? "フェーズ";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

/** @type {Map<string, { phase: string|null, cachedAt: number }>} */
const _cache = new Map();

function resolveTextProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case "rich_text": return prop.rich_text?.[0]?.plain_text?.trim() || null;
    case "select":    return prop.select?.name?.trim() || null;
    case "email":     return prop.email?.trim() || null;
    case "formula":
      if (prop.formula?.type === "string") return prop.formula.string?.trim() || null;
      break;
    case "title":     return prop.title?.[0]?.plain_text?.trim() || null;
  }
  return null;
}

function maskEmail(email) {
  return email.replace(/^(.{2})(.*)(@.*)$/, (_, a, _b, c) => `${a}***${c}`);
}

/**
 * Intercom コンタクトのメールアドレスをキーに Notion CSM DB を検索し、
 * 顧客フェーズを返す。
 *
 * @param {string|null} email
 * @returns {Promise<{ phase: string|null, source: "notion"|"not_found"|"not_configured"|"error" }>}
 */
export async function getCustomerPhase(email) {
  const dbId = process.env.NOTION_CSM_DATABASE_ID;
  if (!dbId || !email) {
    return { phase: null, source: "not_configured" };
  }

  const cached = _cache.get(email);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return { phase: cached.phase, source: cached.phase ? "notion" : "not_found" };
  }

  try {
    const pages = await queryDatabase(dbId, {
      filter: {
        property: EMAIL_PROP,
        email: { equals: email }
      }
    });

    const page = pages[0] ?? null;
    const phase = page ? (resolveTextProp(page.properties?.[PHASE_PROP]) ?? null) : null;

    _cache.set(email, { phase, cachedAt: Date.now() });

    const source = page ? "notion" : "not_found";
    logger.info("notion-csm: customer phase fetched", {
      email: maskEmail(email),
      phase,
      source
    });
    return { phase, source };
  } catch (err) {
    logger.warn("notion-csm: phase lookup failed", { error: err?.message });
    return { phase: null, source: "error" };
  }
}

/** テスト用: キャッシュをクリアする */
export function clearPhaseCache() {
  _cache.clear();
}
