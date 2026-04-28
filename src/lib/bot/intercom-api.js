import { config } from "./config.js";

async function icFetch(path, options = {}) {
  const res = await fetch(`${config.intercom.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.intercom.accessToken}`,
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Intercom request failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

export async function replyToConversation(conversationId, messageBody, adminId) {
  return icFetch(`/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      type: "admin",
      admin_id: adminId || config.intercom.adminId,
      body: messageBody,
      message_type: "comment"
    })
  });
}

export async function updateContactAttributes(contactId, customAttributes) {
  return icFetch(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ custom_attributes: customAttributes })
  });
}
