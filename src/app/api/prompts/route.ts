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
    const list: Record<string, unknown>[] = data.list ?? [];
    logger.info("prompts: list fetched", { count: list.length });
    return NextResponse.json({ list });
  } catch (err) {
    logger.error("prompts: list failed", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!TABLE) return NextResponse.json({ error: "NOCODB_PROMPTS_TABLE_ID not set" }, { status: 500 });
  const body = await request.json();
  const promptKey: string | undefined = body.prompt_key ?? body.promptKey;
  const { content } = body;
  if (!promptKey || typeof content !== "string") {
    return NextResponse.json({ error: `prompt_key and content are required` }, { status: 400 });
  }
  try {
    const where = `(prompt_key,eq,${encodeURIComponent(promptKey)})`;
    await nocoFetch(`/tables/${TABLE}/records?where=${where}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
    logger.info("prompts: updated", { promptKey });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("prompts: update failed", { promptKey, error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
