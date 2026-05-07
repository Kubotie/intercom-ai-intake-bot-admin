import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const NOCODB_BASE_URL  = process.env.NOCODB_BASE_URL  ?? "";
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN ?? "";
const LOG_INTERCOM_TABLE_ID = "mcwp0o7l2vovnqy";
const NOCODB_BASE_ID        = "pcng30q6j3dqrsk";

// ptmind.com / intercom.io 以外がカスタマー発言
const STAFF_PATTERNS = ["ptmind.com", "intercom.io"];

function isStaffLine(line: string) {
  return STAFF_PATTERNS.some((p) => line.includes(p));
}

// "[2026-05-01 16:15:30] email@example.com: 本文" → { timestamp, email, body }
function parseLine(line: string) {
  const m = line.match(/^\[([^\]]+)\]\s+([^:]+):\s+([\s\S]+)$/);
  if (!m) return null;
  return { timestamp: m[1].trim(), email: m[2].trim(), body: m[3].trim() };
}

function extractUserMessages(rawBody: string) {
  const lines = rawBody.split("\n").map((l) => l.trim()).filter(Boolean);
  const result: { order: number; timestamp: string; email: string; body: string }[] = [];
  let order = 0;
  for (const line of lines) {
    if (isStaffLine(line)) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    order++;
    result.push({ order, ...parsed });
  }
  return result;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(Number(searchParams.get("limit")  ?? "30"), 50);
  const search = searchParams.get("search") ?? "";

  const where = search
    ? `(message_type,eq,support)~and(raw_body,like,%${encodeURIComponent(search)}%)`
    : `(message_type,eq,support)`;

  const url = `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${LOG_INTERCOM_TABLE_ID}`
    + `?limit=${limit}&where=${where}&sort=-sent_at_unix`
    + `&fields=source_record_id,display_title,raw_body,sent_at_jst,massage_count`;

  try {
    const res = await fetch(url, {
      headers: { "xc-token": NOCODB_API_TOKEN },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `NocoDB error ${res.status}` }, { status: 502 });
    }
    const data = await res.json() as { list: Record<string, unknown>[] };

    const conversations = (data.list ?? []).map((r) => {
      const rawBody = typeof r.raw_body === "string" ? r.raw_body : "";
      const userMessages = extractUserMessages(rawBody);
      return {
        id:            r.source_record_id,
        title:         r.display_title ?? "(タイトルなし)",
        sent_at:       r.sent_at_jst,
        message_count: r.massage_count,
        user_messages: userMessages,
      };
    }).filter((c) => (c.user_messages as unknown[]).length > 0);

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message ?? "fetch failed" }, { status: 500 });
  }
}
