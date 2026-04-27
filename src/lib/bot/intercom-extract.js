/**
 * Intercom webhook payload から必要なフィールドを抽出する。
 *
 * topic ごとの payload 構造差:
 *   conversation.user.created  → message 本体は item.source (source.id / source.body)
 *   conversation.user.replied  → 新規 message は item.conversation_parts の最新 user part
 *                                 (conversation_part.id / conversation_part.body)
 *                                 item.source は最初のメッセージのままなので使わない
 */
export function extractIntercomEvent(payload) {
  const event_topic =
    payload?.topic ||
    payload?.event_name ||
    payload?.type ||
    payload?.data?.type ||
    null;

  const item = payload?.data?.item || payload?.item || null;

  // ── conversation_id ───────────────────────────
  const intercom_conversation_id =
    item?.id ||
    item?.conversation_id ||
    payload?.data?.conversation?.id ||
    payload?.conversation?.id ||
    null;

  // ── source: created での message 本体 ──────────
  const source =
    item?.source ||
    item?.conversation_message ||
    payload?.data?.conversation_message ||
    null;

  // ── conversation_parts: replied での message 本体 ──
  //   item.conversation_parts.conversation_parts が配列で届く
  const rawParts =
    item?.conversation_parts?.conversation_parts ||
    (Array.isArray(item?.conversation_parts) ? item.conversation_parts : null) ||
    null;

  const isReplied = event_topic === "conversation.user.replied";

  // replied の場合: author.type === "user" の最新 part を選ぶ
  let latestUserPart = null;
  if (isReplied && Array.isArray(rawParts) && rawParts.length > 0) {
    const userParts = rawParts.filter(p => p?.author?.type === "user");
    // 配列末尾が最新と仮定 (Intercom は時系列順に返す)
    latestUserPart = userParts.length > 0 ? userParts[userParts.length - 1] : null;
  }

  // ── intercom_message_id ───────────────────────
  //   replied → conversation_part.id を優先。source.id は 1通目のままなので使わない。
  //   created → source.id を優先。
  let intercom_message_id;
  let message_id_source;

  if (isReplied) {
    if (latestUserPart?.id) {
      intercom_message_id = String(latestUserPart.id);
      message_id_source   = "conversation_part.id";
    } else {
      // conversation_part が無い場合のフォールバック (異常系)
      const fallbackId =
        source?.id ||
        item?.conversation_message?.id ||
        payload?.data?.conversation_message?.id ||
        (intercom_conversation_id
          ? `${intercom_conversation_id}:${payload?.created_at || Date.now()}`
          : null);
      intercom_message_id = fallbackId ? String(fallbackId) : null;
      message_id_source   = "source.id(replied-fallback)";
    }
  } else {
    // created など
    const srcId =
      source?.id ||
      item?.conversation_message?.id ||
      payload?.data?.conversation_message?.id ||
      payload?.message?.id ||
      (intercom_conversation_id
        ? `${intercom_conversation_id}:${payload?.created_at || Date.now()}`
        : null);
    intercom_message_id = srcId ? String(srcId) : null;
    message_id_source   = source?.id ? "source.id" : "fallback";
  }

  // ── latest_user_message ───────────────────────
  //   replied → conversation_part.body を優先
  //   created → source.body を優先
  const rawBody =
    (isReplied && latestUserPart?.body)
      ? latestUserPart.body
      : (source?.body ||
         source?.message ||
         item?.conversation_message?.body ||
         payload?.data?.conversation_message?.body ||
         "");

  const latest_user_message = stripHtml(rawBody).trim();

  // ── author_type ────────────────────────────────
  //   replied の場合は conversation_part の author を優先する
  const author_type =
    (isReplied && latestUserPart?.author?.type) ||
    source?.author?.type ||
    item?.source?.author?.type ||
    item?.conversation_message?.author?.type ||
    null;

  // ── author_name ────────────────────────────────
  const author_name =
    (isReplied && latestUserPart?.author?.name) ||
    source?.author?.name ||
    item?.source?.author?.name ||
    item?.conversation_message?.author?.name ||
    null;

  // ── intercom_contact_id ───────────────────────
  const intercom_contact_id =
    item?.contacts?.contacts?.[0]?.id ||
    item?.contacts?.[0]?.id ||
    payload?.data?.contact?.id ||
    payload?.contact?.id ||
    null;

  // ── created_at_ts ─────────────────────────────
  const created_at_ts =
    source?.created_at ||
    item?.created_at ||
    payload?.created_at ||
    Math.floor(Date.now() / 1000);

  return {
    event_topic,
    intercom_conversation_id: intercom_conversation_id ? String(intercom_conversation_id) : null,
    intercom_message_id,
    intercom_contact_id: intercom_contact_id ? String(intercom_contact_id) : null,
    latest_user_message,
    created_at_ts,
    author_type,
    author_name: author_name || null,
    message_id_source,
    raw_payload_json: JSON.stringify(payload)
  };
}

function stripHtml(text) {
  return String(text).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
