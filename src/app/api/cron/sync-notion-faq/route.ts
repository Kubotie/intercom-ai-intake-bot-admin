import { NextResponse } from "next/server";
import { syncNotionFaq } from "@/lib/bot/knowledge/sync-notion-faq.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  try {
    const result = await syncNotionFaq();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] sync-notion-faq error:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
