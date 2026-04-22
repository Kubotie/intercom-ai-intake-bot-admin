// ─────────────────────────────────────────────
// Skill Registry
//
// intent (category) ごとに使用できる skill の一覧を定義する。
// 各エントリーは実行可能な skill 関数と採用判定の設定を持つ。
//
// 実行順序:
//   orchestrator.js が配列の先頭から順に実行し、最初に採用できた結果を使う。
//   配列の順序 = 試行順序 = 優先順位。
//
// Knowledge Connection Framework における位置づけ:
//
//   intent ごとに source の優先順が異なる:
//
//   usage_guidance (使い方・設定方法):
//     1. help_center_answer  — Help Center (how-to コンテンツが豊富)
//     2. faq_answer          — Notion FAQ (how-to FAQ はないが補完)
//
//   experience_issue (体験・表示・データ問題):
//     1. faq_answer          — Notion FAQ (トラブルシューティング37件が強い)
//     2. help_center_answer  — Help Center (FAQ fallback)
//
//   bug_report:
//     1. known_bug_match     — 既知バグ (support_ai_known_issues テーブル)
//
//   CSE 系知識 (notion_cse) はこの registry には含めない。
//   CSE は summary_for_agent / recommended_next_step の補助に限定する。
//
// 新しい skill を追加するとき:
//   1. src/lib/skills/ に skill ファイルを追加する
//   2. このファイルに import して対象 category の配列に追加する
//   3. 採用判定に必要な confidenceThreshold 等を設定する
// ─────────────────────────────────────────────

import { runHelpCenterAnswerSkill, CONFIDENCE_THRESHOLD as HC_THRESHOLD, SKILL_NAME as HC_NAME } from "./help-center-answer.js";
import { runFaqAnswerSkill, CONFIDENCE_THRESHOLD as FAQ_THRESHOLD, SKILL_NAME as FAQ_NAME } from "./faq-answer.js";
import { runKnownBugMatchSkill, CONFIDENCE_THRESHOLD as BUG_THRESHOLD, SKILL_NAME as BUG_NAME } from "./known-bug-match.js";

/**
 * @typedef {Object} SkillEntry
 * @property {string} name - skill の識別子
 * @property {Function} run - skill 実行関数
 * @property {number} confidenceThreshold - 採用に必要な最低 confidence
 * @property {string} description
 */

/** @type {Record<string, SkillEntry[]>} */
export const SKILL_REGISTRY = {
  // ─── 公開ナレッジ回答の中心 ─────────────────
  usage_guidance: [
    {
      name: HC_NAME,
      run: runHelpCenterAnswerSkill,
      confidenceThreshold: HC_THRESHOLD,
      description: "Ptengine Help Center を参照して使い方質問に回答する (最優先)"
    },
    {
      name: FAQ_NAME,
      run: runFaqAnswerSkill,
      confidenceThreshold: FAQ_THRESHOLD,
      description: "Notion FAQ を参照して回答する (HC fallback)"
    }
  ],

  // experience_issue は FAQ が問題解決型で豊富 (37件) → faq_answer を先に試す
  experience_issue: [
    {
      name: FAQ_NAME,
      run: runFaqAnswerSkill,
      confidenceThreshold: FAQ_THRESHOLD,
      description: "Notion FAQ を参照して体験系問題を解決する (最優先: FAQ が問題解決型で豊富)"
    },
    {
      name: HC_NAME,
      run: runHelpCenterAnswerSkill,
      confidenceThreshold: HC_THRESHOLD,
      description: "Ptengine Help Center を参照して回答する (FAQ fallback)"
    }
  ],

  // ─── 既知バグマッチ ───────────────────────────
  bug_report: [
    {
      name: BUG_NAME,
      run: runKnownBugMatchSkill,
      confidenceThreshold: BUG_THRESHOLD,
      description: "support_ai_known_issues の既知バグ・制約と照合して顧客向けメッセージを返す"
    }
  ],

  // ─── 将来 skill を追加する intent ────────────
  tracking_issue: [],
  report_difference: [],
  login_account: [],
  billing_contract: []
};

/**
 * カテゴリに対応する skill エントリーの配列を返す。
 * 未定義カテゴリは空配列を返す。
 *
 * @param {string} category
 * @returns {SkillEntry[]}
 */
export function getSkillsForCategory(category) {
  return SKILL_REGISTRY[category] ?? [];
}
