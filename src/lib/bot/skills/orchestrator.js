// ─────────────────────────────────────────────
// Skill Orchestrator
//
// intent/category に対応する skill を registry から選び、
// 順に実行して最初に採用できた結果を返す。
//
// 責務:
//   - category → 使える skill 一覧の取得
//   - 各 skill の実行とエラーの吸収
//   - shouldUseSkillResult() による採用判定 + rejection_reason の明示
//   - 採用・非採用のログ出力
//   - 全 skill が不採用なら handled=false を返す
//   - candidate_results で全 skill の実行結果を観測可能にする
// ─────────────────────────────────────────────

import { logger } from "../logger.js";
import { getSkillsForCategory } from "./registry.js";

/**
 * @typedef {Object} SkillResult
 * @property {boolean} handled
 * @property {string|null} answer_type
 * @property {string|null} answer_message
 * @property {number} confidence
 * @property {Array<{title:string, url:string}>} sources
 * @property {string|null} reason
 * @property {boolean} should_escalate
 * @property {string|null} next_action
 */

/**
 * @typedef {Object} CandidateRecord
 * @property {string} skill_name
 * @property {boolean} handled
 * @property {boolean} accepted
 * @property {number} confidence
 * @property {string|null} answer_type
 * @property {string|null} reason
 * @property {string|null} rejection_reason
 */

/**
 * @typedef {Object} OrchestrationResult
 * @property {boolean} handled
 * @property {string|null} answer_type
 * @property {string|null} answer_message
 * @property {number} confidence
 * @property {Array} sources
 * @property {string|null} reason
 * @property {boolean} should_escalate
 * @property {string|null} next_action
 * @property {string|null} selected_skill
 * @property {CandidateRecord[]} candidate_results
 */

/** skill が何も採用されなかったときのデフォルト結果 */
const UNHANDLED_RESULT = Object.freeze({
  handled: false,
  answer_type: null,
  answer_message: null,
  confidence: 0,
  sources: [],
  reason: "no skill handled",
  should_escalate: false,
  next_action: null
});

// ─────────────────────────────────────────────
// rejection_reason コード一覧:
//   not_handled              — skill.handled=false (候補なし・検索失敗など)
//   missing_answer_type      — answer_type が null
//   empty_answer_message     — answer_message が null または空
//   confidence_below_threshold — confidence が threshold 未満
//   exception                — skill の run() が例外を throw した
// ─────────────────────────────────────────────

/**
 * skill 結果を採用するかを判定し、採用/不採用と理由コードを返す。
 * 採用基準をここに集約することで、skill ごとに閾値を変えやすくする。
 *
 * @param {SkillResult|null} result
 * @param {import("./registry.js").SkillEntry} skillEntry
 * @returns {{ accepted: boolean, rejection_reason: string|null }}
 */
export function shouldUseSkillResult(result, skillEntry) {
  if (!result || !result.handled) {
    return { accepted: false, rejection_reason: "not_handled" };
  }

  if (!result.answer_type) {
    return { accepted: false, rejection_reason: "missing_answer_type" };
  }

  const msg = result.answer_message ? String(result.answer_message).trim() : "";
  if (msg.length === 0) {
    return { accepted: false, rejection_reason: "empty_answer_message" };
  }

  const threshold = typeof skillEntry?.confidenceThreshold === "number"
    ? skillEntry.confidenceThreshold
    : 0.65;

  if (typeof result.confidence !== "number" || result.confidence < threshold) {
    return { accepted: false, rejection_reason: "confidence_below_threshold" };
  }

  return { accepted: true, rejection_reason: null };
}

/**
 * category に対応する skill を順に実行し、最初に採用できた結果を返す。
 * candidate_results に全 skill の実行結果と rejection_reason を含める。
 *
 * @param {{ category: string, latestUserMessage: string, collectedSlots: object, ctx: object }} opts
 * @returns {Promise<OrchestrationResult>}
 */
export async function runSkillOrchestration({ category, latestUserMessage, collectedSlots, ctx }) {
  const skills = getSkillsForCategory(category);
  /** @type {CandidateRecord[]} */
  const candidateResults = [];

  if (skills.length === 0) {
    logger.info("skill orchestration: no skills for category", { category, ...ctx });
    return {
      ...UNHANDLED_RESULT,
      reason: "no skills registered for category",
      selected_skill: null,
      candidate_results: []
    };
  }

  logger.info("skill orchestration started", {
    category,
    skill_count: skills.length,
    skill_names: skills.map((s) => s.name),
    ...ctx
  });

  for (const skillEntry of skills) {
    logger.info("skill candidate selected", {
      category,
      skill_name: skillEntry.name,
      ...ctx
    });

    let result;
    try {
      result = await skillEntry.run({ latestUserMessage, category, collectedSlots });

      logger.info("skill executed", {
        category,
        skill_name: skillEntry.name,
        handled: result?.handled ?? false,
        confidence: result?.confidence ?? 0,
        answer_type: result?.answer_type ?? null,
        answer_candidate_json: result?.answer_candidate_json ?? null,
        ...ctx
      });

      const { accepted, rejection_reason } = shouldUseSkillResult(result, skillEntry);

      candidateResults.push({
        skill_name: skillEntry.name,
        handled: result?.handled ?? false,
        accepted,
        confidence: result?.confidence ?? 0,
        answer_type: result?.answer_type ?? null,
        reason: result?.reason ?? null,
        rejection_reason,
        answer_candidate_json: result?.answer_candidate_json ?? null
      });

      if (accepted) {
        logger.info("skill result accepted", {
          category,
          skill_name: skillEntry.name,
          confidence: result.confidence,
          answer_type: result.answer_type,
          accepted: true,
          ...ctx
        });
        return {
          ...result,
          selected_skill: skillEntry.name,
          candidate_results: candidateResults
        };
      }

      logger.info("skill result rejected", {
        category,
        skill_name: skillEntry.name,
        handled: result?.handled ?? false,
        confidence: result?.confidence ?? 0,
        answer_type: result?.answer_type ?? null,
        reason: result?.reason ?? null,
        rejection_reason,
        accepted: false,
        answer_candidate_json: result?.answer_candidate_json ?? null,
        ...ctx
      });
    } catch (err) {
      const rejection_reason = "exception";
      logger.warn("skill execution error, skipping", {
        category,
        skill_name: skillEntry.name,
        rejection_reason,
        error: err?.message,
        ...ctx
      });
      candidateResults.push({
        skill_name: skillEntry.name,
        handled: false,
        accepted: false,
        confidence: 0,
        answer_type: null,
        reason: null,
        rejection_reason
      });
    }
  }

  logger.info("no skill result accepted", {
    category,
    candidate_count: candidateResults.length,
    ...ctx
  });
  return {
    ...UNHANDLED_RESULT,
    selected_skill: null,
    candidate_results: candidateResults
  };
}
