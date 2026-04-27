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

export async function GET() {
  if (!TABLE) return NextResponse.json({ error: "NOCODB_PROMPTS_TABLE_ID not set" }, { status: 500 });
  try {
    const data = await nocoFetch(`/tables/${TABLE}/records?limit=50&sort=prompt_key`);
    logger.info("prompts: list fetched", { count: data.list?.length ?? 0 });
    return NextResponse.json({ list: data.list ?? [] });
  } catch (err) {
    logger.error("prompts: list failed", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!TABLE) return NextResponse.json({ error: "NOCODB_PROMPTS_TABLE_ID not set" }, { status: 500 });
  const body = await request.json();
  const { Id, content } = body;
  if (!Id || typeof content !== "string") {
    return NextResponse.json({ error: "Id and content are required" }, { status: 400 });
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
