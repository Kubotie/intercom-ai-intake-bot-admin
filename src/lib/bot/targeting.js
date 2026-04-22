// ─────────────────────────────────────────────────────────────────────────────
// M3.8 targeting — test target 判定 + concierge 解決
//
// 判定ロジック (OR):
//   1. env allowlist  (INTERCOM_TEST_CONTACT_IDS / INTERCOM_TEST_CONVERSATION_IDS)
//   2. NocoDB support_ai_test_targets  (is_active=true かつ environment が一致)
//
// Concierge 解決 (優先順):
//   1. matchedTarget.concierge_key  → そのキーの concierge を取得
//   2. なければ is_main=true の concierge を取得
//   3. それも取れなければ hardcoded_fallback
//
// 次フェーズ (rollout_rules):
//   support_ai_rollout_rules を使った contact/email/plan/company 条件の rule engine。
//   今フェーズは test_targets + concierge で安全な test 運用を成立させる。
// ─────────────────────────────────────────────────────────────────────────────

import { config } from "./config.js";
import { logger } from "./logger.js";
import { getActiveTestTargets, getConciergeByKey, getMainConcierge } from "./nocodb-repo.js";

// in-memory cache: 60秒 TTL でテスト頻度の高い環境でも NocoDB を過負荷にしない
let _targetsCache = null;
let _targetsCacheAt = 0;
const TARGETS_CACHE_TTL_MS = 60_000;

async function fetchCachedTargets() {
  const now = Date.now();
  if (_targetsCache && now - _targetsCacheAt < TARGETS_CACHE_TTL_MS) {
    return _targetsCache;
  }
  try {
    const fresh = await getActiveTestTargets();
    _targetsCache = fresh;
    _targetsCacheAt = now;
  } catch (err) {
    // NocoDB 障害時は stale cache またはからリストで継続
    if (!_targetsCache) _targetsCache = [];
    logger.warn("targeting: test_targets cache refresh failed, using stale/empty", {
      error: err?.message || String(err)
    });
  }
  return _targetsCache;
}

/**
 * NODE_ENV と NocoDB target.environment を照合する。
 * environment が null/空 → 環境を問わず有効。
 * environment="prod"    → NODE_ENV=production のみ有効。
 * environment="staging" → NODE_ENV=staging のみ有効。
 * environment="dev"     → NODE_ENV=development のみ有効。
 */
function envMatches(targetEnv) {
  if (!targetEnv) return true;
  const env = targetEnv.toLowerCase();
  const nodeEnv = (config.nodeEnv || "development").toLowerCase();
  if (env === "prod")    return nodeEnv === "production";
  if (env === "staging") return nodeEnv === "staging";
  if (env === "dev")     return nodeEnv === "development";
  return true;
}

/**
 * test target 判定 + concierge 解決
 *
 * @param {{ contactId: string|null, conversationId: string|null }} opts
 * @returns {Promise<{
 *   allowed: boolean,
 *   reason: string,                   // reply_disabled / not_test_target / env_contact / env_conversation / nocodb_contact / nocodb_conversation
 *   matchedTarget: object|null,       // NocoDB test_target レコード (env match 時は null)
 *   matchedType: string|null,         // "contact" / "conversation" etc.
 *   matchedValue: string|null,        // マッチした値
 *   concierge: object|null,           // NocoDB concierge レコード
 *   conciergeKey: string|null,
 *   conciergeName: string|null,
 *   conciergeSource: string|null,     // "target_key" / "main_fallback" / "hardcoded_fallback" / null
 *   targetMatchReason: string|null    // reason の別名 (session 保存用)
 * }>}
 */
export async function resolveTargetAndConcierge({ contactId, conversationId }) {
  const deny = (reason) => ({
    allowed: false, reason,
    matchedTarget: null, matchedType: null, matchedValue: null,
    concierge: null, conciergeKey: null, conciergeName: null,
    conciergeSource: null, targetMatchReason: null
  });

  // ── Step 1: master switch ───────────────────────
  if (!config.enableIntercomReply) {
    return deny("reply_disabled");
  }

  // ── Step 2: env allowlist (fast, 同期) ──────────
  let envReason = null;
  const envContacts      = config.intercom.testContactIds ?? [];
  const envConversations = config.intercom.testConversationIds ?? [];

  if (contactId && envContacts.includes(String(contactId))) {
    envReason = "env_contact";
  } else if (conversationId && envConversations.includes(String(conversationId))) {
    envReason = "env_conversation";
  }

  // ── Step 3: NocoDB test_targets ─────────────────
  let matchedTarget = null;
  let nocoReason = null;

  if (config.nocodb.tables.testTargets) {
    try {
      const targets = await fetchCachedTargets();
      for (const t of targets) {
        if (!t.is_active) continue;
        if (!envMatches(t.environment)) continue;

        const type  = String(t.target_type ?? "");
        const value = String(t.target_value ?? "");

        if (type === "contact" && contactId && String(contactId) === value) {
          matchedTarget = t;
          nocoReason = "nocodb_contact";
          break;
        }
        if (type === "conversation" && conversationId && String(conversationId) === value) {
          matchedTarget = t;
          nocoReason = "nocodb_conversation";
          break;
        }
        // email / domain / plan / company: Intercom 連絡先属性が必要 → 次フェーズで対応
      }
    } catch (err) {
      logger.warn("targeting: test_targets lookup failed, env allowlist only", {
        error: err?.message || String(err)
      });
    }
  }

  const finalReason = envReason || nocoReason;
  if (!finalReason) {
    return deny("not_test_target");
  }

  // ── Step 4: concierge 解決 ───────────────────────
  const targetConciergeKey = matchedTarget?.concierge_key ?? null;
  let concierge = null;
  let conciergeSource = null;

  if (targetConciergeKey && config.nocodb.tables.concierges) {
    try {
      concierge = await getConciergeByKey(targetConciergeKey);
      if (concierge) conciergeSource = "target_key";
    } catch (err) {
      logger.warn("targeting: concierge fetch by key failed", {
        concierge_key: targetConciergeKey,
        error: err?.message || String(err)
      });
    }
  }

  if (!concierge && config.nocodb.tables.concierges) {
    try {
      concierge = await getMainConcierge();
      if (concierge) conciergeSource = "main_fallback";
    } catch (err) {
      logger.warn("targeting: main concierge fetch failed", {
        error: err?.message || String(err)
      });
    }
  }

  if (!concierge) {
    conciergeSource = "hardcoded_fallback";
  }

  return {
    allowed: true,
    reason: finalReason,
    matchedTarget,
    matchedType:  matchedTarget?.target_type ?? (envReason ? envReason.replace("env_", "") : null),
    matchedValue: matchedTarget?.target_value ?? null,
    concierge,
    conciergeKey:   concierge?.concierge_key  ?? null,
    conciergeName:  concierge?.display_name   ?? null,
    conciergeSource,
    targetMatchReason: finalReason
  };
}

/** テスト対象キャッシュを強制リセット（テスト用） */
export function clearTargetsCache() {
  _targetsCache = null;
  _targetsCacheAt = 0;
}
