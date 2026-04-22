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

export async function replyToConversation(conversationId, messageBody) {
  return icFetch(`/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      type: "admin",
      admin_id: config.intercom.adminId,
      body: messageBody,
      message_type: "comment"
    })
  });
}
