// 列名を修正したい場合はこのファイルだけ直す。
//
// support_ai_sessions テーブルに必要な列:
//   Long text 列:
//     answer_candidate_json  — turn ごとの候補回答 JSON (skill / next_message / handoff メタデータ)
//     final_summary_json     — turn ごとの最終サマリー (reply_source 確定後)
//   個別フィールド (一覧ビュー用):
//     selected_skill, reply_source, handoff_reason, escalation_reason
//     filled_slots_count, missing_slots_count, reply_preview
//     customer_intent_summary, recommended_next_step, decision_trace
// 列が存在しない場合、NocoDB は UPDATE を silently ignore する (エラーなし・保存なし)。

// category → 顧客意図の日本語ラベル (handoff-summary.js と同値; 変更するときは両方直す)
const CATEGORY_INTENT_LABEL = {
  tracking_issue:    "計測・トラッキングの不具合確認",
  report_difference: "レポート数値の差異確認",
  login_account:     "ログイン・アカウント問題の解決",
  billing_contract:  "請求・契約内容の確認",
  bug_report:        "機能不具合の報告・確認",
  usage_guidance:    "機能の使い方・操作案内",
  experience_issue:  "体験・表示・データ問題の解決"
};

function safeParse(raw) {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

// 内部 status ↔ NocoDB Single Select 値のマッピング
// NocoDB 側の許可値: collecting, ready_to_answer, answered, escalated, closed
const STATUS_TO_DB = {
  collecting:        "collecting",
  ready_for_handoff: "ready_to_answer",
  handed_off:        "answered"
};
const DB_TO_STATUS = {
  collecting:      "collecting",
  ready_to_answer: "ready_for_handoff",
  answered:        "handed_off",
  escalated:       "collecting",
  closed:          "handed_off"
};

export function dbStatusToInternal(dbStatus) {
  return DB_TO_STATUS[dbStatus] || dbStatus || "collecting";
}

export function buildSessionInsert({ sessionUid, conversationId, contactId, latestUserMessage, category = null }) {
  return {
    session_uid: sessionUid,
    intercom_conversation_id: conversationId,
    intercom_contact_id: contactId,
    status: "collecting",
    category,
    priority: "medium",
    should_escalate: false,
    latest_user_message: latestUserMessage,
    final_summary_json: null,
    answer_candidate_json: null
  };
}

export function buildSessionUpdate({ latestUserMessage, category, shouldEscalate, status, finalSummaryJson, answerCandidateJson, observabilityFields }) {
  return {
    ...(latestUserMessage !== undefined ? { latest_user_message: latestUserMessage } : {}),
    ...(category !== undefined ? { category: category } : {}),
    ...(shouldEscalate !== undefined ? { should_escalate: shouldEscalate } : {}),
    ...(status !== undefined ? { status: STATUS_TO_DB[status] || status } : {}),
    ...(finalSummaryJson !== undefined ? { final_summary_json: finalSummaryJson } : {}),
    ...(answerCandidateJson !== undefined ? { answer_candidate_json: answerCandidateJson } : {}),
    // observabilityFields はすでに snake_case (NocoDB 列名そのまま) なので変換不要
    ...(observabilityFields ? observabilityFields : {})
  };
}

/**
 * answer_candidate_json と final_summary_json から NocoDB sessions の個別フィールド patch を生成する。
 *
 * 同期フィールド一覧 (NocoDB 列名固定):
 *   selected_skill, reply_source, handoff_reason, escalation_reason,
 *   filled_slots_count, missing_slots_count, reply_preview,
 *   customer_intent_summary, recommended_next_step, decision_trace
 *
 * @param {{ answerCandidateJson: string|object|null, finalSummaryJson: string|object|null, category: string, latestUserMessage: string|null }} opts
 * @returns {object} NocoDB sessions 個別フィールド (snake_case)
 */
/**
 * createSession 実行前の必須フィールド検証。pure function。
 *
 * @param {{ sessionUid: string|null, conversationId: string|null }} opts
 * @returns {{ valid: boolean, reason: string|null }}
 */
export function validateSessionCreatePayload({ sessionUid, conversationId }) {
  if (!sessionUid || !String(sessionUid).trim()) {
    return { valid: false, reason: "session_uid is empty" };
  }
  if (!conversationId || !String(conversationId).trim()) {
    return { valid: false, reason: "intercom_conversation_id is empty" };
  }
  return { valid: true, reason: null };
}

export function buildSessionObservabilityFields({ answerCandidateJson, finalSummaryJson, category }) {
  const acj = safeParse(answerCandidateJson);
  const fsj = safeParse(finalSummaryJson);

  // answer_candidate_json 由来 (fsj をフォールバックに使う: handed_off 時は acj が null)
  const selected_skill      = acj?.selected_skill      ?? fsj?.selected_skill      ?? null;
  const handoff_reason      = acj?.handoff_reason      ?? null;
  const escalation_reason   = acj?.escalation_reason   ?? null;
  const filled_slots_count  = acj?.filled_slots_count  ?? fsj?.filled_slots_count  ?? null;
  const missing_slots_count = acj?.missing_slots_count ?? fsj?.missing_slots_count ?? null;

  // final_summary_json 由来
  const reply_source   = fsj?.reply_source ?? null;
  // decision_trace は fsj 優先 (より新しい情報), 次に acj
  const decision_trace = fsj?.decision_trace ?? acj?.decision_trace ?? null;

  // reply_preview: answer_message → next_message → null (最大 300 文字)
  const rawPreview = acj?.answer_message || acj?.next_message || "";
  const reply_preview = String(rawPreview).trim().slice(0, 300) || null;

  // summary_for_agent 由来 (handoff / escalation のみ fsj に存在する)
  const agentSummary = fsj?.summary_for_agent ?? null;

  let customer_intent_summary = agentSummary?.customer_intent ?? null;
  if (!customer_intent_summary && category) {
    customer_intent_summary = CATEGORY_INTENT_LABEL[category] ?? category;
  }

  let recommended_next_step = agentSummary?.recommended_next_step ?? null;
  if (!recommended_next_step) {
    if (escalation_reason) {
      recommended_next_step = "緊急対応を優先してください";
    } else if (handoff_reason) {
      recommended_next_step = "収集済み情報をもとに対応を進めてください";
    }
  }

  return {
    selected_skill,
    reply_source,
    handoff_reason,
    escalation_reason,
    filled_slots_count,
    missing_slots_count,
    reply_preview,
    customer_intent_summary,
    recommended_next_step,
    decision_trace
  };
}

export function buildMessageInsert({ sessionUid, messageId, role, messageText, messageOrder, createdAtTs, rawPayloadJson }) {
  return {
    session_uid: sessionUid,
    intercom_message_id: messageId,
    role,
    message_text: messageText,
    message_order: messageOrder,
    created_at_ts: createdAtTs,
    raw_payload_json: rawPayloadJson
  };
}

export function buildSlotUpdate({ slotValue, isCollected, source, confidence }) {
  return {
    slot_value: slotValue,
    is_collected: isCollected,
    source,
    confidence
  };
}

export function buildSlotInsert({ sessionUid, slotName, slotValue, isRequired, isCollected, source, confidence = 1 }) {
  return {
    session_uid: sessionUid,
    slot_name: slotName,
    slot_value: slotValue,
    is_required: isRequired,
    is_collected: isCollected,
    source,
    confidence
  };
}
