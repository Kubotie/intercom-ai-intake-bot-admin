// ─────────────────────────────────────────────
// agentic-slot-loop.js
//
// Hybrid Agentic Slot Loop のオーケストレーター。
// troubleshoot intent のターンごとに runAgenticTroubleshootLoop() を呼ぶ。
//
// 処理フロー:
//   1. Notion CSM DB から顧客フェーズを取得 (contactEmail をキーに)
//   2. 全スロット (固定 + 過去ターンの動的) を LLM に渡して推論
//   3. 抽出された固定スロット値を NocoDB に保存
//   4. 抽出された動的スロット値を NocoDB に保存 (前ターン生成分の回答)
//   5. 新規動的スロットを NocoDB に作成 (次ターンで回答を得る)
//   6. { is_handoff_ready, next_action, reasoning, dynamic_slots_to_ask } を返す
// ─────────────────────────────────────────────

import { getCustomerPhase } from "./notion-csm.js";
import { agenticTroubleshootLoop } from "./llm.js";
import { createSlot, updateSlot } from "./nocodb-repo.js";
import { REQUIRED_SLOTS_BY_CATEGORY, HANDOFF_MIN_CONDITION_BY_CATEGORY } from "./categories.js";
import { logger } from "./logger.js";

function isFilledSlot(slot) {
  return (
    slot.is_collected &&
    slot.slot_value !== null &&
    slot.slot_value !== undefined &&
    String(slot.slot_value).trim() !== ""
  );
}

/**
 * @param {{
 *   sessionUid: string,
 *   session: object,
 *   event: object,
 *   allSlots: object[],           // listSlotsBySessionUid() の結果
 *   conversationHistorySummary: string|null,
 *   nlInstruction: string|null,
 *   globalPolicyInstruction: string|null,
 *   sentiment: string|null,       // "frustrated"|"neutral"|"positive"
 *   customerName: string|null,
 *   ctx: object,
 * }} opts
 *
 * @returns {Promise<{
 *   is_handoff_ready: boolean,
 *   next_action: "ask_user"|"handoff_to_human",
 *   reasoning: string|null,
 *   dynamic_slots_to_ask: Array<{ slot_name: string, question_text: string }>,
 *   customer_phase: string|null,
 *   final_output_text: string|null,   // ユーザーへの送信文（LLM生成済み完成形）
 * }|null>}
 */
export async function runAgenticTroubleshootLoop({
  sessionUid,
  session,
  event,
  allSlots,
  conversationHistorySummary,
  nlInstruction,
  globalPolicyInstruction,
  sentiment,
  customerName,
  ctx,
}) {
  const category = session.category;
  const fixedSlotNames = REQUIRED_SLOTS_BY_CATEGORY[category] || [];
  const handoffMinCondition = HANDOFF_MIN_CONDITION_BY_CATEGORY[category] ?? null;

  // 1. Notion から顧客フェーズを取得 (失敗しても続行)
  let customerPhase = null;
  if (event.intercom_contact_email) {
    const phaseResult = await getCustomerPhase(event.intercom_contact_email).catch((err) => {
      logger.warn("agentic-slot-loop: customer phase fetch failed (non-fatal)", {
        sessionUid,
        error: err?.message,
        ...ctx
      });
      return { phase: null };
    });
    customerPhase = phaseResult.phase ?? null;
  }

  // 2. LLM 推論 (単一呼び出しで抽出 + 判定 + 動的スロット生成)
  let llmResult;
  try {
    llmResult = await agenticTroubleshootLoop({
      category,
      handoffMinCondition,
      fixedSlotNames,
      currentSlots: allSlots.map((s) => ({
        slot_name:    s.slot_name,
        slot_value:   s.slot_value ?? null,
        is_collected: Boolean(s.is_collected),
        is_required:  Boolean(s.is_required),
        source:       s.source ?? "system",
      })),
      latestUserMessage:       event.latest_user_message,
      conversationHistorySummary: conversationHistorySummary ?? null,
      customerPhase,
      sentiment:               sentiment ?? "neutral",
      customerName:            customerName ?? null,
      nlInstruction:           nlInstruction ?? null,
      globalPolicyInstruction: globalPolicyInstruction ?? null,
    });
  } catch (err) {
    logger.warn("agentic-slot-loop: LLM call failed, falling back to rule-based flow", {
      sessionUid,
      error: err?.message,
      ...ctx
    });
    return null; // caller falls back to legacy slot extraction
  }

  const finalOutputText = llmResult.dialogue_generation?.final_output_text?.trim() || null;

  logger.info("agentic-slot-loop: reasoning completed", {
    sessionUid,
    category,
    is_handoff_ready:           Boolean(llmResult.is_handoff_ready),
    next_action:                llmResult.next_action ?? "ask_user",
    extracted_fixed_count:      Object.keys(llmResult.extracted_fixed_slots  ?? {}).length,
    extracted_dynamic_count:    Object.keys(llmResult.extracted_dynamic_slots ?? {}).length,
    dynamic_slots_to_ask_count: (llmResult.dynamic_slots_to_ask ?? []).length,
    has_final_output_text:      Boolean(finalOutputText),
    customer_phase:             customerPhase,
    sentiment:                  sentiment ?? "neutral",
    reasoning:                  llmResult.reasoning ?? null,
    ...ctx
  });

  // 3. 固定スロットの抽出値を NocoDB に保存
  const slotMap = new Map(allSlots.map((s) => [s.slot_name, s]));

  await _persistExtractedSlots({
    sessionUid, category,
    extracted: llmResult.extracted_fixed_slots ?? {},
    slotMap,
    ctx,
    label: "fixed"
  });

  // 4. 動的スロットの抽出値を NocoDB に保存 (前ターンで生成した動的スロットへの回答)
  await _persistExtractedSlots({
    sessionUid, category,
    extracted: llmResult.extracted_dynamic_slots ?? {},
    slotMap,
    ctx,
    label: "dynamic"
  });

  // 5. 新規動的スロットを NocoDB に作成
  const dynamicSlotsToAsk = Array.isArray(llmResult.dynamic_slots_to_ask)
    ? llmResult.dynamic_slots_to_ask.slice(0, 2)
    : [];

  for (const { slot_name } of dynamicSlotsToAsk) {
    if (!slot_name || slotMap.has(slot_name)) continue; // already exists, skip

    await createSlot({
      sessionUid,
      slotName:    slot_name,
      slotValue:   null,
      isRequired:  false,   // 動的スロットはハンドオフ最低条件に含めない
      isCollected: false,
      source:      "dynamic",
      confidence:  1.0,
    }).catch((err) => {
      logger.warn("agentic-slot-loop: dynamic slot create failed", {
        sessionUid, slot_name, error: err?.message, ...ctx
      });
    });

    logger.info("agentic-slot-loop: dynamic slot created", {
      sessionUid, category, slot_name, ...ctx
    });
  }

  return {
    is_handoff_ready:     Boolean(llmResult.is_handoff_ready),
    next_action:          llmResult.next_action ?? "ask_user",
    reasoning:            llmResult.reasoning ?? null,
    dynamic_slots_to_ask: dynamicSlotsToAsk,
    customer_phase:       customerPhase,
    final_output_text:    finalOutputText,
  };
}

// ─── 内部ヘルパー ─────────────────────────────────────────────────────────────

// LLM が「分からない」系の回答に対して返すセンチネル値
const UNKNOWN_SENTINEL = "__unknown__";

async function _persistExtractedSlots({ sessionUid, category, extracted, slotMap, ctx, label }) {
  for (const [slotName, slotValue] of Object.entries(extracted)) {
    if (!slotValue || String(slotValue).trim() === "") continue;

    const existing = slotMap.get(slotName);
    if (!existing) {
      logger.warn(`agentic-slot-loop: ${label} slot not found in NocoDB, skipping`, {
        sessionUid, slotName, ...ctx
      });
      continue;
    }

    if (isFilledSlot(existing)) continue; // already filled — do not overwrite

    const normalized = String(slotValue).trim();
    const isUnknown  = normalized === UNKNOWN_SENTINEL;

    const rowId = existing.Id ?? existing.id;
    await updateSlot(rowId, {
      slotValue:   normalized,
      isCollected: true,          // "__unknown__" でも is_collected=true にして再質問を防ぐ
      source:      isUnknown ? "user_declined" : "user_message",
      confidence:  isUnknown ? 1.0 : 0.9,
    }).catch((err) => {
      logger.warn(`agentic-slot-loop: ${label} slot update failed`, {
        sessionUid, slotName, error: err?.message, ...ctx
      });
    });

    logger.info(
      isUnknown
        ? `agentic-slot-loop: ${label} slot declined (unknown)`
        : `agentic-slot-loop: ${label} slot extracted`,
      { sessionUid, category, slot_name: slotName, is_unknown: isUnknown, ...ctx }
    );
  }
}
