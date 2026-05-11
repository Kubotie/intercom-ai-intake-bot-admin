import { type NextRequest } from "next/server";
import { logRawPayload, logger } from "@/lib/bot/logger.js";
import { processIntercomWebhook } from "@/lib/bot/processor.js";
import { initDynamicSkills } from "@/lib/bot/skills/registry.js";
import { processAutoFaq } from "@/lib/bot/auto-faq.js";

export const runtime = "nodejs";

// コールドスタートごとに1回だけ動的スキルをロード
let skillsInitPromise: Promise<void> | null = null;

export async function POST(request: NextRequest) {
  if (!skillsInitPromise) {
    skillsInitPromise = initDynamicSkills();
  }
  await skillsInitPromise;
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const topic = (payload?.topic ?? payload?.event_name ?? "unknown") as string;
  const convId =
    (payload?.data as Record<string, unknown>)?.item
      ? ((payload.data as Record<string, unknown>).item as Record<string, unknown>)?.id
      : ((payload?.data as Record<string, unknown>)?.conversation as Record<string, unknown>)?.id ?? null;

  logger.info("webhook received", { topic, intercom_conversation_id: convId });
  logRawPayload(payload, { topic, conversation_id: convId as string | null });

  // ── タグ付け → 自動 FAQ 化 ───────────────────────────────────────────────
  if (topic === "conversation_part.tag.created") {
    processAutoFaq(payload).then((result) => {
      if (result.skipped) {
        logger.info("auto-faq: skipped", { reason: result.reason });
      } else {
        logger.info("auto-faq: completed", {
          notion_page_id: result.notion_page_id,
          sync_stats: result.sync_stats,
        });
      }
    }).catch((err: Error) => {
      logger.warn("auto-faq: failed", { error: err?.message });
    });
    return new Response("ok", { status: 200 });
  }

  try {
    await processIntercomWebhook(payload);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error("webhook processing failed", {
      topic,
      intercom_conversation_id: convId,
      error: err?.message ?? String(error),
      stack: err?.stack ?? null,
    });
  }

  return new Response("ok", { status: 200 });
}
