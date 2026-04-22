// ─────────────────────────────────────────────
// skill: known_bug_match
//
// bug_report intent 専用。
// NocoDB の support_ai_known_issues テーブルを参照し、
// 既知の不具合や既知制約に一致する場合は顧客向けメッセージを返す。
//
// 対象レコード条件:
//   - published_to_bot = true
//   - status != "archived"
//
// 照合方法:
//   - matching_keywords とユーザー発話 / symptom slot のキーワード一致
//   - 一致率が confidenceThreshold 以上の場合のみ採用
//
// 信頼度閾値チェックは orchestrator が行う。
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { listRecords } from "../nocodb.js";
import { logger } from "../logger.js";

export const SKILL_NAME = "known_bug_match";
export const CONFIDENCE_THRESHOLD = 0.70;

function unwrapList(data) {
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data)) return data;
  return [];
}

function notHandled(reason) {
  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence: 0,
    sources: [],
    reason,
    should_escalate: false,
    next_action: null
  };
}

/**
 * NocoDB から published_to_bot=true の known issues を取得する。
 * @returns {Promise<Array>}
 */
async function loadPublishedKnownIssues() {
  const data = await listRecords(config.nocodb.tables.knownIssues, { limit: 200 });
  const all = unwrapList(data);
  return all.filter((issue) => {
    // published_to_bot は boolean / 1 / "true" のいずれかで届く可能性がある
    const pub = issue.published_to_bot;
    const isPublished = pub === true || pub === 1 || String(pub).toLowerCase() === "true";
    if (!isPublished) return false;
    const status = String(issue.status || "").toLowerCase();
    return status !== "archived";
  });
}

/**
 * issue の matching_keywords と検索テキストのキーワード一致率を計算する。
 * @param {object} issue
 * @param {string} searchText
 * @returns {number} 0.0〜1.0
 */
export function computeKeywordScore(issue, searchText) {
  const raw = String(issue.matching_keywords || "");
  if (!raw.trim()) return 0;
  const keywords = raw.split(/[,、\s]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return 0;
  const text = searchText.toLowerCase();
  const matched = keywords.filter((k) => text.includes(k));
  return matched.length / keywords.length;
}

/**
 * bug_report 専用 既知バグマッチ skill。
 *
 * 共通 skill interface を返す。信頼度閾値チェックは orchestrator が行う。
 *
 * @param {{ latestUserMessage: string, category: string, collectedSlots: object }} opts
 * @returns {Promise<SkillResult>}
 */
export async function runKnownBugMatchSkill({ latestUserMessage, category, collectedSlots }) {
  if (category !== "bug_report") {
    return notHandled("category is not bug_report");
  }

  if (!config.nocodb.tables.knownIssues) {
    return notHandled("NOCODB_KNOWN_ISSUES_TABLE_ID not configured");
  }

  const searchText = [
    latestUserMessage || "",
    collectedSlots?.symptom || "",
    collectedSlots?.reproduction_steps || ""
  ].join(" ").trim();

  logger.info("known bug skill started", { category });

  let issues = [];
  try {
    issues = await loadPublishedKnownIssues();
    logger.info("known issue candidates loaded", { category, count: issues.length });
  } catch (err) {
    logger.warn("known issue load failed", { category, error: err?.message });
    return notHandled(`known issues load failed: ${err?.message}`);
  }

  if (issues.length === 0) {
    return notHandled("no published known issues");
  }

  // スコアリング: キーワード一致率で降順ソート
  const scored = issues
    .map((issue) => ({ issue, score: computeKeywordScore(issue, searchText) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    logger.info("known issue match rejected", { category, reason: "no keyword match" });
    return notHandled("no matching known issues");
  }

  const best = scored[0];
  const confidence = Math.min(best.score, 1.0);
  const issueKey = best.issue.issue_key || null;

  logger.info("known issue matched", {
    category,
    issue_key: issueKey,
    confidence
  });

  const customerSafeMessage = String(best.issue.customer_safe_message || "").trim();
  if (!customerSafeMessage) {
    logger.info("known issue match rejected", {
      category,
      issue_key: issueKey,
      reason: "no customer_safe_message"
    });
    return notHandled("matched issue has no customer_safe_message");
  }

  return {
    handled: true,
    answer_type: SKILL_NAME,
    answer_message: customerSafeMessage,
    confidence,
    sources: [{
      title: best.issue.title || issueKey || "既知の問題",
      url: null,
      issue_key: issueKey
    }],
    reason: `既知の問題 (${issueKey || "?"}) に一致 (score=${confidence.toFixed(2)})`,
    should_escalate: false,
    next_action: "reply"
  };
}
