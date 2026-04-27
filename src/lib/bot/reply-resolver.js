// ─────────────────────────────────────────────
// reply 文面解決モジュール
//
// 優先順位:
//   1. should_escalate=true                              → escalation 固定文
//   2. status=ready_for_handoff                          → handoff 固定文
//   3. status=handed_off                                 → 返信しない (already_handed_off)
//   4. answer_candidate_json.answer_type が skill answer  → skill 回答文
//      (help_center_answer / known_bug_match 等)
//   5. answer_candidate_json.next_message が有効         → LLM 生成質問文 (next_message)
//   6. fallback                                          → 固定確認文 (fallback)
//
// 新しい skill の answer_type を追加するには SKILL_ANSWER_TYPES に追記する。
// ─────────────────────────────────────────────

import { HANDOFF_REPLY } from "./handoff-guard.js";

export { HANDOFF_REPLY };

export const ESCALATION_REPLY =
  "ご連絡ありがとうございます。内容を確認し、担当者に引き継いで確認いたします。必要に応じて追加で確認させてください。";

export const FALLBACK_REPLY =
  "ご連絡ありがとうございます。内容を確認しております。";

// 1件の返信に含まれる最大文字数 (保護)
const MAX_REPLY_LENGTH = 1000;

// skill 回答として有効な answer_type 一覧
// 新しい skill を追加した際はここに追記する
const SKILL_ANSWER_TYPES = new Set(["help_center_answer", "faq_answer", "known_bug_match", "soft_answer"]);

function safeParseCandidate(raw) {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function buildHandoffReply(authorName) {
  const prefix = authorName ? `${authorName}様、` : "";
  return `${prefix}ご共有いただきありがとうございます。確認できましたので、担当者に引き継ぎ確認いたします。引き続きよろしくお願い申し上げます。`;
}

function buildEscalationReply(authorName) {
  const prefix = authorName ? `${authorName}様、` : "";
  return `${prefix}ご連絡いただきありがとうございます🙇‍♀️ 内容を確認し、担当者に引き継いで対応いたします。引き続きよろしくお願い申し上げます。`;
}

function buildFallbackReply(authorName) {
  const prefix = authorName ? `${authorName}様、` : "";
  return `${prefix}ご連絡ありがとうございます。内容を確認しております。引き続きよろしくお願い申し上げます。`;
}

/**
 * @param {{ answerCandidateJson: string|object|null, shouldEscalate: boolean, status: string, authorName?: string|null }} opts
 * @returns {{ replyMessage: string|null, replySource: "escalation"|"handoff"|"already_handed_off"|"help_center_answer"|"faq_answer"|"known_bug_match"|"soft_answer"|"next_message"|"fallback" }}
 */
export function resolveReplyMessage({ answerCandidateJson, shouldEscalate, status, authorName }) {
  // 優先度 1: エスカレーション (status に関わらず最優先)
  if (shouldEscalate) {
    return { replyMessage: buildEscalationReply(authorName), replySource: "escalation" };
  }

  // 優先度 2: handoff 準備完了 → 固定 handoff 文面
  if (status === "ready_for_handoff") {
    return { replyMessage: buildHandoffReply(authorName), replySource: "handoff" };
  }

  // 優先度 3: すでに handed_off → 返信しない
  if (status === "handed_off") {
    return { replyMessage: null, replySource: "already_handed_off" };
  }

  const candidate = safeParseCandidate(answerCandidateJson);

  // 優先度 4: skill 回答 (help_center_answer / known_bug_match / soft_answer 等)
  // replySource には answer_type をそのまま使う (例: "known_bug_match")
  if (SKILL_ANSWER_TYPES.has(candidate?.answer_type) && candidate?.answer_message) {
    const replyMessage = String(candidate.answer_message).trim().slice(0, MAX_REPLY_LENGTH);
    if (replyMessage.length > 0) {
      return { replyMessage, replySource: candidate.answer_type };
    }
  }

  // 優先度 5: LLM 生成の next_message
  const rawMessage = candidate?.next_message;
  if (rawMessage && String(rawMessage).trim().length > 0) {
    const replyMessage = String(rawMessage).trim().slice(0, MAX_REPLY_LENGTH);
    return { replyMessage, replySource: "next_message" };
  }

  // 優先度 6: fallback
  return { replyMessage: buildFallbackReply(authorName), replySource: "fallback" };
}
