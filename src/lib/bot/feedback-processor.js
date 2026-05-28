// ─────────────────────────────────────────────
// feedback-processor
//
// Intercom 会話上でサポート担当者が "/fb <テキスト>" と
// note を書いたときにフィードバックを NocoDB に蓄積する。
//
// トリガー: conversation_part.created (admin note)
// 保存先:   support_ai_feedback テーブル (NOCODB_FEEDBACK_TABLE_ID)
//
// Claude Code 連携:
//   GET /api/cron/feedback-report で週次レポートを取得し、
//   claude に渡して ai-support-bot-md/ を改善する。
// ─────────────────────────────────────────────

import { logger } from "./logger.js";
import { findSessionByConversationId, createFeedback, findFeedbackByNotePartId } from "./nocodb-repo.js";
import { addNoteToConversation, getConversationWithParts } from "./intercom-api.js";
import { config } from "./config.js";

const FB_PREFIX_RE = /^\/fb\s*/i;

/** Intercom note body は HTML。テキストだけ取り出す。 */
function stripHtml(html) {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * @param {Record<string, unknown>} payload  Intercom webhook payload (conversation_part.created)
 */
export async function processFeedbackNote(payload) {
  // ── payload から会話パートを抽出 ──
  const dataItem  = payload?.data?.item ?? payload?.data ?? null;
  const convId    = String(dataItem?.id ?? "");
  if (!convId) return;

  const parts = dataItem?.conversation_parts?.conversation_parts ?? [];
  const part  = parts[0] ?? null;
  if (!part) return;

  // ── admin note 以外は無視 ──
  if (part.part_type !== "note") return;
  if (part.author?.type !== "admin") return;

  // ── /fb プレフィックスを確認 ──
  const rawBody = stripHtml(String(part.body ?? ""));
  if (!FB_PREFIX_RE.test(rawBody)) return;

  const feedbackText = rawBody.replace(FB_PREFIX_RE, "").trim();
  if (!feedbackText) return;

  const adminId = String(part.author?.id ?? "");
  logger.info("feedback note detected", { convId, adminId });

  // ── セッションからコンテキストを取得 ──
  let session = null;
  try {
    session = await findSessionByConversationId(convId);
  } catch (err) {
    logger.warn("feedback: session lookup failed (non-fatal)", { convId, error: err?.message });
  }

  // ── NocoDB に保存 ──
  try {
    await createFeedback({
      sessionUid:          session?.session_uid           || null,
      conversationId:      convId,
      adminId,
      feedbackText,
      originalUserMessage: session?.latest_user_message  || null,
      aiResponseSnapshot:  session?.answer_candidate_json || null,
      category:            session?.category              || null,
      replySource:         session?.reply_source          || null,
      notePartId:          String(part?.id ?? "") || null,
    });
    logger.info("feedback saved", {
      convId,
      adminId,
      category: session?.category,
      feedback_length: feedbackText.length,
    });
  } catch (err) {
    logger.warn("feedback save failed", { convId, error: err?.message });
    return;
  }

  // ── 担当者へ受付確認 note を返す ──
  if (config.intercom.adminId) {
    try {
      await addNoteToConversation(
        convId,
        "✅ フィードバックを受け付けました。改善活動に活用します。",
        config.intercom.adminId
      );
    } catch (err) {
      logger.warn("feedback ack note failed (non-fatal)", { convId, error: err?.message });
    }
  }
}

/**
 * 特定の会話を Intercom API から取得し、未処理の /fb ノートを保存する。
 * conversation.user.replied webhook や cron から呼び出す。
 *
 * @param {string} convId
 * @returns {Promise<{ saved: number }>}
 */
export async function scanConversationForFeedback(convId) {
  if (!convId) return { saved: 0 };

  let fullConv;
  try {
    fullConv = await getConversationWithParts(convId);
  } catch (err) {
    logger.warn("scanConversationForFeedback: failed to fetch conversation", { convId, error: err?.message });
    return { saved: 0 };
  }

  const parts = fullConv?.conversation_parts?.conversation_parts ?? [];
  let saved = 0;

  for (const part of parts) {
    if (part?.part_type !== "note") continue;
    if (part?.author?.type !== "admin") continue;

    const rawBody = stripHtml(String(part?.body ?? ""));
    if (!FB_PREFIX_RE.test(rawBody)) continue;

    const notePartId = String(part?.id ?? "");
    if (!notePartId) continue;

    const existing = await findFeedbackByNotePartId(notePartId).catch(() => null);
    if (existing) continue;

    const feedbackText = rawBody.replace(FB_PREFIX_RE, "").trim();
    if (!feedbackText) continue;

    const adminId = String(part?.author?.id ?? "");

    let session = null;
    try {
      session = await findSessionByConversationId(convId);
    } catch { /* non-fatal */ }

    try {
      await createFeedback({
        sessionUid:          session?.session_uid           || null,
        conversationId:      convId,
        adminId,
        feedbackText,
        originalUserMessage: session?.latest_user_message  || null,
        aiResponseSnapshot:  session?.answer_candidate_json || null,
        category:            session?.category              || null,
        replySource:         session?.reply_source          || null,
        notePartId,
      });
      saved++;
      logger.info("scanConversationForFeedback: feedback saved", { convId, adminId, notePartId });

      if (config.intercom.adminId) {
        await addNoteToConversation(
          convId,
          "✅ フィードバックを受け付けました。改善活動に活用します。",
          config.intercom.adminId
        ).catch((err) => {
          logger.warn("scanConversationForFeedback: ack note failed", { convId, error: err?.message });
        });
      }
    } catch (err) {
      logger.warn("scanConversationForFeedback: save failed", { convId, notePartId, error: err?.message });
    }
  }

  return { saved };
}
