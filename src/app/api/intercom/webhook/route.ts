import { type NextRequest } from "next/server";
import { logRawPayload, logger } from "@/lib/bot/logger.js";
import { processIntercomWebhook } from "@/lib/bot/processor.js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
