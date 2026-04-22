import { NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_KNOWLEDGE_SOURCES_TABLE_ID ?? "";

export async function GET() {
  if (!TBL) return NextResponse.json({ list: [] });
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=50&sort=-last_synced_at`;
  const res = await fetch(url, { headers: { "xc-token": TOKEN } });
  return NextResponse.json(await res.json());
}
