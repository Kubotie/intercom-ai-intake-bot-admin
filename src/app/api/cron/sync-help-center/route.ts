import { NextResponse } from "next/server";
import { syncIntercomHelpCenter } from "@/lib/bot/knowledge/sync-intercom-help-center.js";

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
    const result = await syncIntercomHelpCenter();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] sync-help-center error:", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
