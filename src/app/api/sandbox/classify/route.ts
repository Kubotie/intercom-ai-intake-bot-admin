import { type NextRequest, NextResponse } from "next/server";
import { classifyCategory } from "@/lib/bot/llm.js";
import { CATEGORY_LIST } from "@/lib/bot/categories.js";
import { config } from "@/lib/bot/config.js";
import { logger } from "@/lib/bot/logger.js";

export const runtime = "nodejs";

const FALLBACK_CATEGORY = "usage_guidance";

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

  const executedAt = new Date().toISOString();
  const ctx = { sandbox: true, mode: "classify_only" };

  logger.info("sandbox classify started", { ...ctx, message_length: message.length });

  if (!config.llm.apiKey) {
    logger.warn("sandbox classify: LLM_API_KEY not configured, using fallback", ctx);
    return NextResponse.json({
      category: FALLBACK_CATEGORY,
      confidence: 0,
      reason: "LLM_API_KEY not configured — fallback to usage_guidance",
      input_message: message,
      executed_at: executedAt,
      prompt_file: "ai-support-bot-md/prompts/classifier_prompt.md",
    });
  }

  try {
    const result = await classifyCategory({
      latestUserMessage: message,
      categoryCandidates: CATEGORY_LIST as string[],
    });
    const category = (CATEGORY_LIST as string[]).includes(result.category)
      ? result.category
      : FALLBACK_CATEGORY;
    logger.info("sandbox classify completed", { ...ctx, category, confidence: result.confidence ?? 0 });
    return NextResponse.json({
      category,
      confidence: result.confidence ?? 0,
      reason: result.reason ?? null,
      input_message: message,
      executed_at: executedAt,
      prompt_file: "ai-support-bot-md/prompts/classifier_prompt.md",
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn("sandbox classify failed", { ...ctx, error: error?.message });
    return NextResponse.json(
      { error: error?.message ?? "classification failed" },
      { status: 500 }
    );
  }
}
