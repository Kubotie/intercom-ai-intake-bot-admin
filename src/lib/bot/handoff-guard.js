// ─────────────────────────────────────────────
// handoff 判定モジュール
//
// isReadyForHandoff(category, slots) → boolean
//   カテゴリごとの最小条件を満たしているか判定する。
//   required: すべて揃っている
//   any_of:   各グループのうち少なくとも1つ揃っている
// ─────────────────────────────────────────────

import { HANDOFF_MIN_CONDITION_BY_CATEGORY, CANCELLATION_KEYWORDS } from "./categories.js";
import { evaluateHandoffReadinessNL } from "./llm.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const HANDOFF_REPLY =
  "ご共有ありがとうございます。必要な情報を確認できましたので、担当者に引き継いで確認いたします。必要に応じて追加でご連絡します。";

function isFilledSlot(slot) {
  return (
    slot.is_collected &&
    slot.slot_value !== null &&
    slot.slot_value !== undefined &&
    String(slot.slot_value).trim() !== ""
  );
}

/**
 * billing_contract で解約/返金が inquiry_topic に含まれるか判定する
 */
function isCancellationCase(slots) {
  const filledMap = {};
  for (const s of slots) {
    if (isFilledSlot(s)) filledMap[s.slot_name] = String(s.slot_value);
  }
  const topic = filledMap["inquiry_topic"] ?? "";
  return CANCELLATION_KEYWORDS.some((kw) => topic.includes(kw));
}

/**
 * @param {string} category
 * @param {Array} slots - support_ai_slots rows
 * @returns {boolean}
 */
export function isReadyForHandoff(category, slots) {
  const condition = HANDOFF_MIN_CONDITION_BY_CATEGORY[category];
  if (!condition) return false;

  const filledNames = new Set(slots.filter(isFilledSlot).map((s) => s.slot_name));

  // billing_contract の解約/返金は account_email_or_user も必須
  if (category === "billing_contract" && isCancellationCase(slots)) {
    return filledNames.has("inquiry_topic") && filledNames.has("account_email_or_user");
  }

  for (const req of condition.required) {
    if (!filledNames.has(req)) return false;
  }

  for (const group of condition.any_of) {
    if (!group.some((name) => filledNames.has(name))) return false;
  }

  return true;
}

/**
 * 自然言語指示 (nlInstruction) をもとに LLM でハンドオフ判定する。
 * LLM 未設定または失敗時はルールベース (isReadyForHandoff) にフォールバック。
 *
 * @param {string} category
 * @param {Array} slots - support_ai_slots rows
 * @param {string} nlInstruction - Admin UI で記述した自然言語の対応方針
 * @param {string} latestUserMessage
 * @returns {Promise<{ ready: boolean; reason: string; source: string }>}
 */
export async function isReadyForHandoffNL(category, slots, nlInstruction, latestUserMessage) {
  if (!nlInstruction || !config.llm.apiKey) {
    const ready = isReadyForHandoff(category, slots);
    return { ready, reason: resolveHandoffReason(category, slots) ?? "", source: "rule_based" };
  }

  const collectedSlots = Object.fromEntries(
    slots.filter(isFilledSlot).map((s) => [s.slot_name, s.slot_value])
  );

  try {
    const result = await evaluateHandoffReadinessNL({
      category,
      nlInstruction,
      collectedSlots,
      latestUserMessage
    });
    logger.info("handoff eval NL completed", {
      category,
      ready: result.ready,
      reason: result.reason,
      source: "nl_instruction"
    });
    return { ready: result.ready === true, reason: result.reason ?? "", source: "nl_instruction" };
  } catch (err) {
    logger.warn("handoff eval NL failed, using rule-based fallback", { category, error: err?.message });
    const ready = isReadyForHandoff(category, slots);
    return { ready, reason: resolveHandoffReason(category, slots) ?? "", source: "rule_based_fallback" };
  }
}

/**
 * handoff に切り替えた理由を人が読める文字列で返す。
 * isReadyForHandoff が true のときのみ呼ぶことを想定。
 *
 * @param {string} category
 * @param {Array} slots
 * @returns {string|null}
 */
export function resolveHandoffReason(category, slots) {
  const condition = HANDOFF_MIN_CONDITION_BY_CATEGORY[category];
  if (!condition) return null;

  const filledNames = new Set(slots.filter(isFilledSlot).map((s) => s.slot_name));

  if (category === "billing_contract" && isCancellationCase(slots)) {
    return "minimum_condition_met (billing_contract:cancellation; required: inquiry_topic, account_email_or_user present)";
  }

  const parts = [];

  const presentRequired = condition.required.filter((r) => filledNames.has(r));
  if (presentRequired.length > 0) {
    parts.push(`required: ${presentRequired.join(", ")} present`);
  }

  for (const group of condition.any_of) {
    const presentInGroup = group.filter((name) => filledNames.has(name));
    if (presentInGroup.length > 0) {
      parts.push(`any_of: ${presentInGroup.join(", ")} present`);
    }
  }

  if (parts.length === 0) return "minimum_condition_met";
  return `minimum_condition_met (${parts.join("; ")})`;
}
