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
