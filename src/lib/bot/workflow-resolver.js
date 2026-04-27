// ─────────────────────────────────────────────────────────────────────────────
// Workflow Resolver
//
// runtime が active workflow definition を取得し、
// skill_config_json / handoff_config_json / policy_config_json を解析して実行に反映するモジュール。
//
// スキーマバージョン:
//   v1: skill_config_json (category_skill_order) + handoff_config_json のみ
//   v2: v1 の上位互換。policy_config_json / source_config_json / intents_config_json を追加。
//       intents_config_json でカテゴリごとのスロット・handoff 条件・スキルを直接定義できる。
//
// 解決順:
//   1. workflowKey 明示指定 (sandbox / test 用)
//   2. status=active の workflow (本番 runtime)
//   3. fallback (workflow なし → registry default / categories.js default を使用)
//
// 優先順位:
//   workflow.intents[cat] > workflow.policy / sources > concierge profile > system default
// ─────────────────────────────────────────────────────────────────────────────

import { config } from "./config.js";
import { listRecords } from "./nocodb.js";
import { logger } from "./logger.js";

function unwrapList(data) {
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data)) return data;
  return [];
}

const DEFAULT_SKILL_CONFIG   = Object.freeze({ version: 1, category_skill_order: {} });
const DEFAULT_HANDOFF_CONFIG = Object.freeze({ version: 1, global_preset: "balanced", category_presets: {} });

// v2 defaults
const DEFAULT_POLICY_CONFIG = Object.freeze({
  version: 1,
  escalation_keywords: [],
  handoff_eagerness: "normal"
});
const DEFAULT_SOURCE_CONFIG = Object.freeze({
  version: 1,
  allowed: ["help_center", "notion_faq", "known_issue"],
  priority: ["notion_faq", "help_center", "known_issue"]
});
const DEFAULT_INTENTS_CONFIG = Object.freeze({ version: 1, intents: {} });

/**
 * NocoDB から active workflow を1件取得する。
 *
 * workflowKey 指定あり (sandbox):
 *   そのキーの非アーカイブ workflow を優先して返す。
 *   見つからない場合は active workflow にフォールバック。
 *
 * workflowKey 指定なし (本番):
 *   status=active の workflow を1件返す。
 *
 * @param {string|null} workflowKey
 * @returns {Promise<object|null>}
 */
export async function getActiveWorkflow(workflowKey = null) {
  const tableId = config.nocodb.tables.workflows;
  if (!tableId) return null;

  try {
    if (workflowKey) {
      const data = await listRecords(tableId, {
        where: `(workflow_key,eq,${String(workflowKey).replace(/,/g, "\\,")})~and(status,ne,archived)`,
        limit: 1
      });
      const found = unwrapList(data)[0] ?? null;
      if (found) return found;
    }

    const data = await listRecords(tableId, {
      where: "(status,eq,active)",
      sort: "-UpdatedAt",
      limit: 1
    });
    return unwrapList(data)[0] ?? null;
  } catch (err) {
    logger.warn("workflow-resolver: failed to fetch active workflow", {
      error:        err?.message,
      workflow_key: workflowKey ?? null
    });
    return null;
  }
}

/**
 * workflow record から全設定 JSON をパースして返す。
 * v1 / v2 の両スキーマに対応。パースエラー時はデフォルト値にフォールバック。
 *
 * @param {object|null} workflow  NocoDB workflow レコード
 * @returns {{
 *   skillConfig:    object,
 *   handoffConfig:  object,
 *   policyConfig:   object,   // v2: escalation_keywords / handoff_eagerness
 *   sourceConfig:   object,   // v2: allowed / priority sources
 *   intentsConfig:  object,   // v2: per-category slots / handoff / skills
 *   workflowKey:    string|null,
 *   workflowSource: "explicit"|"active"|"fallback",
 * }}
 */
export function parseWorkflowOverrides(workflow) {
  if (!workflow) {
    return {
      skillConfig:   DEFAULT_SKILL_CONFIG,
      handoffConfig: DEFAULT_HANDOFF_CONFIG,
      policyConfig:  DEFAULT_POLICY_CONFIG,
      sourceConfig:  DEFAULT_SOURCE_CONFIG,
      intentsConfig: DEFAULT_INTENTS_CONFIG,
      workflowKey:   null,
      workflowSource: "fallback"
    };
  }

  let skillConfig   = DEFAULT_SKILL_CONFIG;
  let handoffConfig = DEFAULT_HANDOFF_CONFIG;
  let policyConfig  = DEFAULT_POLICY_CONFIG;
  let sourceConfig  = DEFAULT_SOURCE_CONFIG;
  let intentsConfig = DEFAULT_INTENTS_CONFIG;

  const safeParseField = (jsonStr, fieldName, defaultVal) => {
    if (!jsonStr) return defaultVal;
    try {
      return JSON.parse(jsonStr);
    } catch {
      logger.warn(`workflow-resolver: ${fieldName} parse error, using default`, {
        workflow_key: workflow.workflow_key
      });
      return defaultVal;
    }
  };

  skillConfig   = safeParseField(workflow.skill_config_json,   "skill_config_json",   DEFAULT_SKILL_CONFIG);
  handoffConfig = safeParseField(workflow.handoff_config_json, "handoff_config_json", DEFAULT_HANDOFF_CONFIG);
  policyConfig  = safeParseField(workflow.policy_config_json,  "policy_config_json",  DEFAULT_POLICY_CONFIG);
  sourceConfig  = safeParseField(workflow.source_config_json,  "source_config_json",  DEFAULT_SOURCE_CONFIG);
  intentsConfig = safeParseField(workflow.intents_config_json, "intents_config_json", DEFAULT_INTENTS_CONFIG);

  return {
    skillConfig,
    handoffConfig,
    policyConfig,
    sourceConfig,
    intentsConfig,
    workflowKey:   workflow.workflow_key ?? null,
    workflowSource: "active"
  };
}

/**
 * v2 intents_config からカテゴリの intent 設定を返す。
 * 設定がなければ null を返し、呼び出し側が categories.js の定数にフォールバックする。
 *
 * @param {object} intentsConfig  parseWorkflowOverrides().intentsConfig
 * @param {string} category
 * @returns {{
 *   slots?:   { required: string[], optional: string[], priority: string[] },
 *   handoff?: { preset: string, required: string[], any_of: string[][] },
 *   skills?:  Array<{ name: string, threshold: number }>,
 *   enabled?: boolean,
 * }|null}
 */
export function resolveIntentConfig(intentsConfig, category) {
  return intentsConfig?.intents?.[category] ?? null;
}

/**
 * v2 policy_config から escalation keywords を解決する。
 * policyConfig に値がなければ空配列を返す (呼び出し側がコード定数にフォールバックする)。
 *
 * @param {object} policyConfig  parseWorkflowOverrides().policyConfig
 * @returns {string[]}
 */
export function resolveEscalationKeywords(policyConfig) {
  const kws = policyConfig?.escalation_keywords;
  return Array.isArray(kws) && kws.length > 0 ? kws : [];
}

/**
 * workflow の skill_config_json (category_skill_order) を concierge の skillProfile に
 * マージして新しい skillProfile オブジェクトを返す。
 *
 * workflow override は最高優先度:
 *   workflow の category_skill_order が存在するカテゴリは必ず上書きする。
 *   存在しないカテゴリは baseSkillProfile.orderOverrides をそのまま継承する。
 *
 * @param {object} baseSkillProfile   concierge-profiles.js の SKILL_PROFILES[key]
 * @param {object} workflowSkillConfig  parseWorkflowOverrides().skillConfig
 * @returns {object}  merged skillProfile
 */
export function mergeWorkflowSkillProfile(baseSkillProfile, workflowSkillConfig) {
  const workflowOverrides = workflowSkillConfig?.category_skill_order ?? {};
  if (Object.keys(workflowOverrides).length === 0) return baseSkillProfile;

  return {
    ...baseSkillProfile,
    orderOverrides: {
      ...(baseSkillProfile?.orderOverrides ?? {}),
      ...workflowOverrides  // workflow override が concierge profile を上書き
    }
  };
}

/**
 * workflow の handoff_config_json からカテゴリの handoff preset を解決する。
 * category_presets に当該カテゴリがあればそれを、なければ global_preset を返す。
 *
 * @param {{ global_preset: string, category_presets: Record<string, string> }} handoffConfig
 * @param {string} category
 * @returns {"strict"|"balanced"|"lenient"}
 */
export function resolveHandoffPreset(handoffConfig, category) {
  return handoffConfig?.category_presets?.[category]
    ?? handoffConfig?.global_preset
    ?? "balanced";
}
