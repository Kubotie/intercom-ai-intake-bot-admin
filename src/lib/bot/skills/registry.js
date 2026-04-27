// ─────────────────────────────────────────────
// Skill Registry
//
// ルーティング設定は ai-support-bot-md/bot-routing.json で管理する。
// このファイルはスキル名 → 実行関数のマッピングのみを持つ。
//
// 新しい skill を追加するとき:
//   1. src/lib/bot/skills/ に skill ファイルを追加する
//   2. SKILL_RUNNERS にエントリーを追加する
//   3. ai-support-bot-md/bot-routing.json の該当カテゴリに name を追加する
// ─────────────────────────────────────────────

import { readFileSync } from "fs";
import path from "path";
import { runHelpCenterAnswerSkill } from "./help-center-answer.js";
import { runFaqAnswerSkill } from "./faq-answer.js";
import { runKnownBugMatchSkill } from "./known-bug-match.js";

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

/** @type {Record<string, SkillEntry[]>} */
export const SKILL_REGISTRY = Object.fromEntries(
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

export function getSkillsForCategory(category) {
  return SKILL_REGISTRY[category] ?? [];
}
