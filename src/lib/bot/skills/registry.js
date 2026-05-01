// ─────────────────────────────────────────────
// Skill Registry
//
// ルーティング設定は ai-support-bot-md/bot-routing.json で管理する。
// このファイルはスキル名 → 実行関数のマッピングのみを持つ。
//
// 新しい skill を追加するとき:
//   1. src/lib/bot/skills/ に skill ファイルを追加する（静的スキル）
//   2. または NocoDB の support_ai_skills テーブルに登録する（動的スキル）
// ─────────────────────────────────────────────

import { readFileSync } from "fs";
import path from "path";
import { runHelpCenterAnswerSkill } from "./help-center-answer.js";
import { runFaqAnswerSkill } from "./faq-answer.js";
import { runKnownBugMatchSkill } from "./known-bug-match.js";
import { runDynamicSkill } from "./dynamic-skill-runner.js";
import { listActiveSkills } from "../nocodb-repo.js";
import { getActiveWorkflow, parseWorkflowOverrides } from "../workflow-resolver.js";

const ROUTING_CONFIG_PATH = path.join(process.cwd(), "ai-support-bot-md/bot-routing.json");

const SKILL_RUNNERS = {
  help_center_answer: runHelpCenterAnswerSkill,
  faq_answer:         runFaqAnswerSkill,
  known_bug_match:    runKnownBugMatchSkill
};

/**
 * @typedef {Object} SkillEntry
 * @property {string} name
 * @property {Function} run
 * @property {number} confidenceThreshold
 * @property {string} description
 */

function loadRoutingConfig() {
  try {
    const raw = readFileSync(ROUTING_CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`bot-routing.json の読み込みに失敗しました: ${err.message}`);
  }
}

const routingConfig = loadRoutingConfig();

/** bot-routing.json 由来の静的レジストリ */
const STATIC_REGISTRY = Object.fromEntries(
  Object.entries(routingConfig.routes).map(([category, route]) => [
    category,
    (route.skills || [])
      .map(({ name, confidence_threshold, description }) => {
        const run = SKILL_RUNNERS[name];
        if (!run) {
          console.warn(`[registry] unknown skill name in bot-routing.json: "${name}" (category: ${category})`);
          return null;
        }
        return { name, run, confidenceThreshold: confidence_threshold, description };
      })
      .filter(Boolean)
  ])
);

// 動的スキルキャッシュ（コールドスタートごとに1回ロード）
/** @type {Record<string, SkillEntry[]>} */
let dynamicRegistry = {};

/**
 * NocoDB の skills テーブルから動的スキルを読み込む。
 * Next.js サーバーレス環境では webhook route から呼び出すこと。
 *
 * カテゴリ紐づけの優先順位:
 *   1. ワークフローの intentsConfig.intents[category].skills（ワークフローエディターで設定）
 *   2. スキルレコード自身の intents フィールド（後方互換）
 */
export async function initDynamicSkills() {
  try {
    const skillDefs = await listActiveSkills();

    // skill_key → SkillEntry のルックアップマップ
    const entryMap = {};
    for (const def of skillDefs) {
      entryMap[def.skill_key] = {
        name: def.skill_key,
        run: (args) => runDynamicSkill(def, args),
        confidenceThreshold: def.threshold ?? 0.65,
        description: def.description || def.label || def.skill_key,
      };
    }

    const next = {};

    // 1. スキルの intents フィールドでルーティング（後方互換）
    for (const def of skillDefs) {
      const categories = (() => {
        try { return JSON.parse(def.intents || "[]"); } catch { return []; }
      })();
      for (const cat of categories) {
        if (!next[cat]) next[cat] = [];
        if (!STATIC_REGISTRY[cat]?.some(e => e.name === def.skill_key) && !next[cat].some(e => e.name === def.skill_key)) {
          next[cat].push(entryMap[def.skill_key]);
        }
      }
    }

    // 2. ワークフローの intentsConfig でルーティング（ワークフローエディター設定を反映）
    try {
      const workflow = await getActiveWorkflow();
      const { intentsConfig } = parseWorkflowOverrides(workflow);
      for (const [cat, intentCfg] of Object.entries(intentsConfig?.intents ?? {})) {
        if (intentCfg?.enabled === false) continue;
        const configuredSkills = intentCfg?.skills ?? [];
        if (configuredSkills.length === 0) continue;
        for (const { name: skillName, threshold } of configuredSkills) {
          const baseEntry = entryMap[skillName];
          if (!baseEntry) continue;  // 静的スキルや未登録スキルはスキップ
          const entry = threshold !== undefined ? { ...baseEntry, confidenceThreshold: threshold } : baseEntry;
          if (!next[cat]) next[cat] = [];
          if (!STATIC_REGISTRY[cat]?.some(e => e.name === skillName) && !next[cat].some(e => e.name === skillName)) {
            next[cat].push(entry);
          }
        }
      }
      console.info("[registry] workflow intentsConfig applied to dynamic skill routing");
    } catch (err) {
      console.warn(`[registry] workflow intentsConfig load failed (skipping): ${err?.message}`);
    }

    dynamicRegistry = next;
    console.info(`[registry] dynamic skills loaded: ${skillDefs.length} skill(s)`);
  } catch (err) {
    console.warn(`[registry] dynamic skills load failed (skipping): ${err?.message}`);
  }
}

/**
 * カテゴリに対応する skill エントリーの配列を返す。
 * 静的スキル + 動的スキルをマージして返す。
 *
 * @param {string} category
 * @returns {SkillEntry[]}
 */
export function getSkillsForCategory(category) {
  return [...(STATIC_REGISTRY[category] ?? []), ...(dynamicRegistry[category] ?? [])];
}
