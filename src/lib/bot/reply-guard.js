// ─────────────────────────────────────────────
// reply allowlist ガード
//
// 返信してよい条件:
//   1. ENABLE_INTERCOM_REPLY=true
//   かつ
//   2. contact_id または conversation_id が allowlist に含まれる
//
// 両方空 = 本番安全側: allowlist に誰もいないため返信しない
// ─────────────────────────────────────────────

/**
 * @param {{ contactId: string|null, conversationId: string|null, config: object }} opts
 * @returns {{ allowed: boolean, reason: string }}
 */
export function isAllowedReplyTarget({ contactId, conversationId, config }) {
  if (!config.enableIntercomReply) {
    return { allowed: false, reason: "reply_disabled" };
  }

  const allowedContacts = config.intercom.testContactIds ?? [];
  const allowedConversations = config.intercom.testConversationIds ?? [];

  if (contactId && allowedContacts.includes(String(contactId))) {
    return { allowed: true, reason: "matched_contact" };
  }

  if (conversationId && allowedConversations.includes(String(conversationId))) {
    return { allowed: true, reason: "matched_conversation" };
  }

  return { allowed: false, reason: "not_test_target" };
}
