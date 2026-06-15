// ─────────────────────────────────────────────────────────────────────────────
// Workflow Config Loader
//
// アクティブなワークフローの intents_config_json を NocoDB から取得し、
// キャッシュして提供する。
//
// - TTL: 5分（頻繁な NocoDB アクセスを避ける）
// - テーブル未設定 / ワークフロー未登録時はサイレントに null を返す
// - LLM 側では null の場合にルールベース fallback を使う
// ─────────────────────────────────────────────────────────────────────────────

import { getActiveWorkflow } from "./nocodb-repo.js";
import { logger } from "./logger.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let _cachedConfig = null;
let _cacheTimestamp = 0;

async function fetchAndCacheConfig() {
  const now = Date.now();
  if (_cachedConfig !== null && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedConfig;
  }

  try {
    const workflow = await getActiveWorkflow();
    if (!workflow) {
      _cachedConfig = null;
      _cacheTimestamp = now;
      return null;
    }

    const intentsRaw = workflow.intents_config_json;
    const policyRaw  = workflow.policy_config_json;

    const intentsConfig = intentsRaw ? JSON.parse(intentsRaw) : null;
    const policyConfig  = policyRaw  ? JSON.parse(policyRaw)  : null;

    _cachedConfig = { intentsConfig, policyConfig };
    _cacheTimestamp = now;
    logger.info("workflow config loaded from NocoDB", {
      workflow_key:  workflow.workflow_key,
      intents_count: Object.keys(intentsConfig?.intents ?? {}).length,
      has_nl_policy: !!policyConfig?.nlPolicyInstruction,
    });
    return _cachedConfig;
  } catch (err) {
    logger.warn("workflow config load failed (using rule-based fallback)", { error: err?.message });
    _cachedConfig = null;
    _cacheTimestamp = Date.now();
    return null;
  }
}

/**
 * カテゴリの自然言語指示を返す。未設定時は null。
 * @param {string} category
 * @returns {Promise<string|null>}
 */
export async function getIntentNLInstruction(category) {
  const cached = await fetchAndCacheConfig();
  return cached?.intentsConfig?.intents?.[category]?.nlInstruction ?? null;
}

/**
 * カテゴリ全体の IntentCategoryConfig を返す。未設定時は null。
 * @param {string} category
 * @returns {Promise<object|null>}
 */
export async function getIntentConfig(category) {
  const cached = await fetchAndCacheConfig();
  return cached?.intentsConfig?.intents?.[category] ?? null;
}

/**
 * 分類用のカテゴリ定義リストを返す。
 * intents_config_json に classifyDescription が設定されているカテゴリのみ対象。
 * classifyPriority の降順にソートして返す（LLM の priority order として使用）。
 * 設定がない場合は null を返し、呼び出し元は静的プロンプトにフォールバックする。
 * @returns {Promise<Array<{category:string,description:string,examples:string[],priority:number,boundary_notes:string|null}>|null>}
 */
export async function getClassifyConfig() {
  const cached = await fetchAndCacheConfig();
  const intents = cached?.intentsConfig?.intents;
  if (!intents) return null;
  const entries = Object.entries(intents)
    .filter(([, cfg]) => cfg.enabled !== false && cfg.classifyDescription)
    .sort(([, a], [, b]) => (b.classifyPriority ?? 5) - (a.classifyPriority ?? 5))
    .map(([category, cfg]) => ({
      category,
      description: cfg.classifyDescription,
      examples: cfg.classifyExamples ?? [],
      priority: cfg.classifyPriority ?? 5,
      boundary_notes: cfg.classifyBoundaryNotes ?? null,
    }));
  return entries.length > 0 ? entries : null;
}

/**
 * コンシェルジュに割り当てられたツール一覧を返す。
 * intents_config_json.concierge_tools[conciergeKey] に格納。
 * 未設定時は空配列。
 * @param {string} conciergeKey
 * @returns {Promise<string[]>}
 */
export async function getConciergeTools(conciergeKey) {
  const cached = await fetchAndCacheConfig();
  return cached?.intentsConfig?.concierge_tools?.[conciergeKey] ?? [];
}

/**
 * ワークフロー全体の NL ポリシー指示を返す。未設定時は null。
 * policy_config_json.nlPolicyInstruction に格納。
 * @returns {Promise<string|null>}
 */
export async function getNlPolicyInstruction() {
  const cached = await fetchAndCacheConfig();
  const instruction = cached?.policyConfig?.nlPolicyInstruction;
  return instruction && instruction.trim() ? instruction.trim() : null;
}

/**
 * 有効なカテゴリキーのリストを返す。
 * categories.js の CATEGORY_LIST をベースとし、ワークフローで enabled:false に
 * 設定されたカテゴリのみ除外する。ワークフロー未設定のカテゴリは有効とみなす。
 * (以前: ワークフローに定義されたカテゴリのみ返す → 未定義カテゴリが usage_guidance に集約されるバグ)
 * @returns {Promise<string[]>}
 */
export async function getCategoryList() {
  const { CATEGORY_LIST } = await import("./categories.js");
  const cached = await fetchAndCacheConfig();
  const intents = cached?.intentsConfig?.intents;
  if (!intents || Object.keys(intents).length === 0) {
    return CATEGORY_LIST;
  }
  // ワークフローで enabled:false が明示されたカテゴリのみ除外する。
  // ワークフローに定義されていないカテゴリは有効とみなして CATEGORY_LIST から含める。
  return CATEGORY_LIST.filter(k => intents[k]?.enabled !== false);
}

export function invalidateWorkflowConfigCache() {
  _cachedConfig = null;
  _cacheTimestamp = 0;
}
