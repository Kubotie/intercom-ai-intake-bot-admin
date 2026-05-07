import { type NextRequest, NextResponse } from "next/server";
import { runSandboxSimulation } from "@/lib/bot/sandbox.js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const forceCategory  = typeof body.force_category  === "string" && body.force_category  ? body.force_category  : null;
  const conciergeKey   = typeof body.concierge_key   === "string" && body.concierge_key   ? body.concierge_key   : null;
  const prevCategory   = typeof body.prev_category   === "string" && body.prev_category   ? body.prev_category   : null;
  const prevSlots      = body.prev_slots && typeof body.prev_slots === "object" ? body.prev_slots as Record<string, { value: string; confidence: number }> : {};
  const messageOrder   = typeof body.message_order   === "number" ? body.message_order : 1;
  const conversationId = typeof body.conversation_id === "string" && body.conversation_id
    ? body.conversation_id
    : `sandbox_${Date.now()}`;

  try {
    const result = await runSandboxSimulation({
      latestUserMessage: message,
      forceCategory,
      conciergeKey,
      conversationId,
      contactId: null,
      prevCategory,
      prevSlots,
      messageOrder,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error?.message ?? "simulation failed" },
      { status: 500 }
    );
  }
}
