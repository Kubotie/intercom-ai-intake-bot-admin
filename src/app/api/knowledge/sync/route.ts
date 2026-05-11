import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/bot/logger.js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sourceType = typeof body.source_type === "string" ? body.source_type : "";
  if (!sourceType) {
    return NextResponse.json({ error: "source_type is required" }, { status: 400 });
  }

  const startedAt = new Date().toISOString();
  const ctx = { sandbox: false, source_type: sourceType };

  const SUPPORTED = ["notion_faq", "notion_faq2", "help_center"];
  if (!SUPPORTED.includes(sourceType)) {
    logger.info("knowledge sync: source_type not supported", { ...ctx });
    return NextResponse.json(
      { error: `source_type "${sourceType}" is not supported. Supported: ${SUPPORTED.join(", ")}` },
      { status: 501 }
    );
  }

  logger.info("knowledge sync started", { ...ctx, started_at: startedAt });

  try {
    let stats: Record<string, unknown>;
    let sourceName: string;

    if (sourceType === "notion_faq") {
      const { syncNotionFaq } = await import("@/lib/bot/knowledge/sync-notion-faq.js");
      stats = await syncNotionFaq();
      sourceName = "notion_faq";
    } else if (sourceType === "notion_faq2") {
      const { syncNotionFaq2 } = await import("@/lib/bot/knowledge/sync-notion-faq2.js");
      stats = await syncNotionFaq2();
      sourceName = "notion_faq2";
    } else {
      const { syncIntercomHelpCenter } = await import("@/lib/bot/knowledge/sync-intercom-help-center.js");
      stats = await syncIntercomHelpCenter();
      sourceName = "ptengine_help_center";
    }

    const finishedAt = new Date().toISOString();
    logger.info("knowledge sync completed", { ...ctx, ...stats, finished_at: finishedAt });

    return NextResponse.json({
      ok: true,
      source_type: sourceType,
      source_name: sourceName,
      ...stats,
      started_at: startedAt,
      finished_at: finishedAt,
    });
  } catch (err: unknown) {
    const error = err as Error;
    logger.warn("knowledge sync failed", { ...ctx, error: error?.message });
    return NextResponse.json(
      { error: error?.message ?? "sync failed" },
      { status: 500 }
    );
  }
}
