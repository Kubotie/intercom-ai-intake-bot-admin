/**
 * GET /api/cron/process-pending-completions
 *
 * 5分周期 cron: completion_status='awaiting_completion' のセッションを
 * next_completion_check_at 到来分について再判定し、以下のいずれかを実行する。
 *
 *   status=complete / possibly_complete / incomplete_with_progress
 *      → processIntercomWebhook を再実行して Bot 返信を生成
 *   status=incomplete_empty (count=0)
 *      → count=1, next_completion_check_at=+10min にして再度待機
 *   status=incomplete_empty (count>=1)
 *      → completion_status=monitoring_ended で終了 (Bot は永遠に返信しない)
 */

import { type NextRequest } from "next/server";
import { logger } from "@/lib/bot/logger.js";
import {
  listPendingCompletionSessions,
  listMessagesBySessionUid,
  updateSession,
} from "@/lib/bot/nocodb-repo.js";
import { checkMessageCompleteness } from "@/lib/bot/completion-check.js";
import { processIntercomWebhook } from "@/lib/bot/processor.js";

export const runtime = "nodejs";

const NEXT_WAIT_MS = 10 * 60 * 1000;
const MAX_EMPTY_RETRIES = 1;

interface SessionRow {
  Id: number;
  session_uid: string;
  completion_check_count?: number | null;
  latest_user_message?: string | null;
}

interface MessageRow {
  role: string;
  message_order?: number | null;
  message_text?: string | null;
  raw_payload_json?: string | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const sessions = (await listPendingCompletionSessions({ limit: 20 })) as SessionRow[];
  logger.info("process-pending-completions: scanning", { count: sessions.length });

  let processedCount = 0;
  let retryCount = 0;
  let endedCount = 0;

  for (const s of sessions) {
    try {
      const sessionUid = s.session_uid;
      const rowId = s.Id;
      const currentCount = Number(s.completion_check_count ?? 0);

      // 最新のユーザーメッセージを取得
      const msgs = (await listMessagesBySessionUid(sessionUid, 30)) as MessageRow[];
      const userMsgs = msgs
        .filter((m) => m.role === "user")
        .sort((a, b) => (a.message_order ?? 0) - (b.message_order ?? 0));
      const latest = userMsgs[userMsgs.length - 1];
      if (!latest) {
        logger.warn("process-pending-completions: no user message, ending", { session_uid: sessionUid });
        await updateSession(rowId, {
          observabilityFields: { completion_status: "monitoring_ended" },
        });
        endedCount++;
        continue;
      }

      // bot 返信以降のユーザーメッセージ群を結合して判定に使う
      const botOrders = msgs.filter((m) => m.role === "bot").map((m) => m.message_order ?? 0);
      const lastBotOrder = botOrders.length > 0 ? Math.max(...botOrders) : 0;
      const batchMsgs = userMsgs.filter((m) => (m.message_order ?? 0) > lastBotOrder);
      const combinedMessage = batchMsgs
        .map((m) => String(m.message_text ?? "").trim())
        .filter(Boolean)
        .join("\n");

      const check = await checkMessageCompleteness({
        latestUserMessage: combinedMessage || String(latest.message_text ?? ""),
      });

      logger.info("process-pending-completions: re-check", {
        session_uid: sessionUid,
        count: currentCount,
        status: check.status,
        reason: check.reason,
      });

      if (check.status === "incomplete_empty") {
        if (currentCount >= MAX_EMPTY_RETRIES) {
          // 諦めて監視終了
          await updateSession(rowId, {
            observabilityFields: {
              completion_status: "monitoring_ended",
              completion_check_reason: check.reason,
            },
          });
          endedCount++;
          logger.info("process-pending-completions: monitoring ended (still empty)", { session_uid: sessionUid });
        } else {
          // もう一度 +10min 待機
          const nextCheckAt = new Date(Date.now() + NEXT_WAIT_MS).toISOString();
          await updateSession(rowId, {
            observabilityFields: {
              completion_check_count: currentCount + 1,
              next_completion_check_at: nextCheckAt,
              completion_check_reason: check.reason,
            },
          });
          retryCount++;
          logger.info("process-pending-completions: retry scheduled", {
            session_uid: sessionUid,
            count: currentCount + 1,
            next_check_at: nextCheckAt,
          });
        }
        continue;
      }

      // complete / possibly_complete / incomplete_with_progress → 処理再開
      // completion_status を ready にしてから processIntercomWebhook を再実行
      await updateSession(rowId, {
        observabilityFields: {
          completion_status: "ready",
          completion_check_reason: check.reason,
        },
      });

      // 最新メッセージの raw_payload_json から payload を復元して再処理
      const rawPayload = latest.raw_payload_json ? JSON.parse(latest.raw_payload_json) : null;
      if (!rawPayload) {
        logger.warn("process-pending-completions: raw_payload_json missing, cannot re-process", {
          session_uid: sessionUid,
        });
        await updateSession(rowId, {
          observabilityFields: { completion_status: "monitoring_ended" },
        });
        endedCount++;
        continue;
      }

      logger.info("process-pending-completions: re-processing session", {
        session_uid: sessionUid,
        status: check.status,
      });
      await processIntercomWebhook(rawPayload, { skipCompletionCheck: true });
      processedCount++;
    } catch (err) {
      const error = err as Error;
      logger.warn("process-pending-completions: session processing failed", {
        session_uid: s.session_uid,
        error: error?.message,
      });
    }
  }

  logger.info("process-pending-completions: done", {
    scanned: sessions.length,
    processed: processedCount,
    retry: retryCount,
    ended: endedCount,
  });

  return Response.json({
    scanned: sessions.length,
    processed: processedCount,
    retry: retryCount,
    ended: endedCount,
  });
}
