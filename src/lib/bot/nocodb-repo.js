import { config } from "./config.js";
import { createRecord, listRecords, updateRecord } from "./nocodb.js";
import { buildMessageInsert, buildSessionInsert, buildSessionUpdate, buildSlotInsert, buildSlotUpdate } from "./nocodb-mapper.js";

function unwrapList(data) {
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data)) return data;
  return [];
}

function whereEq(field, value) {
  return `(${field},eq,${String(value).replace(/,/g, "\\,")})`;
}

export async function findSessionByConversationId(conversationId) {
  const data = await listRecords(config.nocodb.tables.sessions, { where: whereEq("intercom_conversation_id", conversationId), limit: 1 });
  return unwrapList(data)[0] || null;
}

export async function createSession({ sessionUid, conversationId, contactId, latestUserMessage, category }) {
  const result = await createRecord(config.nocodb.tables.sessions, buildSessionInsert({ sessionUid, conversationId, contactId, latestUserMessage, category }));
  // NocoDB v2 は POST に対して配列を返す場合がある。Id が取れるよう確実にオブジェクトに正規化する。
  return Array.isArray(result) ? (result[0] ?? {}) : (result ?? {});
}

export async function updateSession(rowId, patch) {
  return updateRecord(config.nocodb.tables.sessions, rowId, buildSessionUpdate(patch));
}

export async function findMessageByIntercomMessageId(messageId) {
  const data = await listRecords(config.nocodb.tables.messages, { where: whereEq("intercom_message_id", messageId), limit: 1 });
  return unwrapList(data)[0] || null;
}

export async function countMessagesBySessionUid(sessionUid) {
  const data = await listRecords(config.nocodb.tables.messages, { where: whereEq("session_uid", sessionUid), limit: 1000 });
  return unwrapList(data).length;
}

export async function createMessage({ sessionUid, messageId, role, messageText, messageOrder, createdAtTs, rawPayloadJson }) {
  return createRecord(config.nocodb.tables.messages, buildMessageInsert({ sessionUid, messageId, role, messageText, messageOrder, createdAtTs, rawPayloadJson }));
}

/**
 * NocoDB の UNIQUE 制約違反エラーかを判定する。
 * HTTP 422 かつ "duplicate" または "unique" を含む場合に true を返す。
 */
export function isDuplicateKeyError(err) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("422") && (msg.includes("duplicate") || msg.includes("unique"));
}

export async function listSlotsBySessionUid(sessionUid) {
  const data = await listRecords(config.nocodb.tables.slots, { where: whereEq("session_uid", sessionUid), limit: 1000 });
  return unwrapList(data);
}

export async function createSlot(slot) {
  return createRecord(config.nocodb.tables.slots, buildSlotInsert(slot));
}

export async function updateSlot(rowId, patch) {
  return updateRecord(config.nocodb.tables.slots, rowId, buildSlotUpdate(patch));
}

export async function getActiveTestTargets() {
  if (!config.nocodb.tables.testTargets) return [];
  const data = await listRecords(config.nocodb.tables.testTargets, {
    where: "(is_active,eq,true)",
    limit: 200
  });
  return unwrapList(data);
}

export async function getConciergeByKey(conciergeKey) {
  if (!config.nocodb.tables.concierges) return null;
  const data = await listRecords(config.nocodb.tables.concierges, {
    where: `(concierge_key,eq,${String(conciergeKey).replace(/,/g, "\\,")})`,
    limit: 1
  });
  return unwrapList(data)[0] || null;
}

export async function getMainConcierge() {
  if (!config.nocodb.tables.concierges) return null;
  const data = await listRecords(config.nocodb.tables.concierges, {
    where: "(is_main,eq,true)~and(is_active,eq,true)",
    limit: 1
  });
  return unwrapList(data)[0] || null;
}

export async function listActiveSkills() {
  if (!config.nocodb.tables.skills) return [];
  const data = await listRecords(config.nocodb.tables.skills, {
    where: "(status,eq,active)",
    limit: 100
  });
  return unwrapList(data);
}

export async function listMessagesBySessionUid(sessionUid, limit = 10) {
  if (!config.nocodb.tables.messages) return [];
  const data = await listRecords(config.nocodb.tables.messages, {
    where: whereEq("session_uid", sessionUid),
    sort: "message_order",
    limit
  });
  return unwrapList(data);
}

// ── feedback ──────────────────────────────────────────────────────────────────

export async function createFeedback({ sessionUid, conversationId, adminId, feedbackText, originalUserMessage, aiResponseSnapshot, category, replySource, notePartId }) {
  if (!config.nocodb.tables.feedback) return null;
  return createRecord(config.nocodb.tables.feedback, {
    session_uid:             sessionUid    || null,
    intercom_conversation_id: conversationId,
    admin_id:                adminId       || null,
    feedback_text:           feedbackText,
    original_user_message:   originalUserMessage  || null,
    ai_response_snapshot:    aiResponseSnapshot   || null,
    category:                category      || null,
    reply_source:            replySource   || null,
    note_part_id:            notePartId    || null,
    status:                  "pending",
  });
}

export async function findFeedbackByNotePartId(notePartId) {
  if (!config.nocodb.tables.feedback || !notePartId) return null;
  const data = await listRecords(config.nocodb.tables.feedback, {
    where: whereEq("note_part_id", notePartId),
    limit: 1,
  });
  return unwrapList(data)[0] || null;
}

export async function listFeedback({ status = null, limit = 200 } = {}) {
  if (!config.nocodb.tables.feedback) return [];
  const where = status ? `(status,eq,${status})` : undefined;
  const data = await listRecords(config.nocodb.tables.feedback, {
    ...(where ? { where } : {}),
    sort: "-CreatedAt",
    limit,
  });
  return unwrapList(data);
}

export async function updateFeedbackStatus(rowId, status, improvementNotes = null) {
  const patch = { status, applied_at: new Date().toISOString() };
  if (improvementNotes) patch.improvement_notes = improvementNotes;
  return updateRecord(config.nocodb.tables.feedback, rowId, patch);
}

export async function listFeedbackByStatuses(statuses, limit = 200) {
  if (!config.nocodb.tables.feedback) return [];
  const where = statuses.length === 1
    ? `(status,eq,${statuses[0]})`
    : `(${statuses.map(s => `(status,eq,${s})`).join(",")})`;
  const data = await listRecords(config.nocodb.tables.feedback, { where, sort: "-CreatedAt", limit });
  return unwrapList(data);
}

export async function getActiveWorkflow() {
  if (!config.nocodb.tables.workflows) return null;
  const data = await listRecords(config.nocodb.tables.workflows, {
    where: "(status,eq,active)",
    limit: 1
  });
  return unwrapList(data)[0] || null;
}

// ── completion check ──────────────────────────────────────────────────────────
//
// 完了判定で「未完了」と判定されたセッションは completion_status=awaiting_completion
// で待機し、cron が定期的に再判定する。

/**
 * cron 用: 次回判定時刻を過ぎた awaiting_completion セッションを取得する。
 */
export async function listPendingCompletionSessions({ limit = 20, now = new Date() } = {}) {
  if (!config.nocodb.tables.sessions) return [];
  const nowIso = now.toISOString();
  // NocoDB v2 の date comparison は ISO 文字列で lte が使える
  const data = await listRecords(config.nocodb.tables.sessions, {
    where: `(completion_status,eq,awaiting_completion)~and(next_completion_check_at,le,${nowIso})`,
    sort: "next_completion_check_at",
    limit
  });
  return unwrapList(data);
}

