import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/bot/logger.js";

export const runtime = "nodejs";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TABLE = process.env.NOCODB_PROMPTS_TABLE_ID ?? "";

async function nocoFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}/api/v2${path}`, {
    ...options,
    headers: { "xc-token": TOKEN, "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) throw new Error(`NocoDB ${res.status}: ${await res.text()}`);
  return res.json();
}

function normalizeId(record: Record<string, unknown>): number | undefined {
  const v = record["Id"] ?? record["id"] ?? record["rowId"] ?? record["row_id"];
  return typeof v === "number" ? v : (typeof v === "string" ? parseInt(v, 10) || undefined : undefined);
}

export async function GET() {
  if (!TABLE) return NextResponse.json({ error: "NOCODB_PROMPTS_TABLE_ID not set" }, { status: 500 });
  try {
    const data = await nocoFetch(`/tables/${TABLE}/records?limit=50&sort[0][field]=prompt_key&sort[0][direction]=asc`);
    const raw: Record<string, unknown>[] = data.list ?? [];
    const list = raw.map(r => ({ ...r, Id: normalizeId(r) }));
    logger.info("prompts: list fetched", { count: list.length, sampleId: list[0]?.Id });
    return NextResponse.json({ list });
  } catch (err) {
    logger.error("prompts: list failed", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!TABLE) return NextResponse.json({ error: "NOCODB_PROMPTS_TABLE_ID not set" }, { status: 500 });
  const body = await request.json();
  const Id: number | undefined = body.Id ?? body.id ?? body.rowId;
  const { content } = body;
  if (!Id || typeof content !== "string") {
    return NextResponse.json({ error: `Id and content are required (got Id=${Id}, contentType=${typeof content})` }, { status: 400 });
  }
  try {
    await nocoFetch(`/tables/${TABLE}/records`, {
      method: "PATCH",
      body: JSON.stringify({ Id, content }),
    });
    logger.info("prompts: updated", { Id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("prompts: update failed", { Id, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
