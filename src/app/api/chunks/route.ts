import { NextRequest, NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const url = new URL(`${BASE}/api/v2/tables/${TBL}/records`);
  ["limit", "offset", "sort", "where"].forEach(k => {
    const v = searchParams.get(k);
    if (v) url.searchParams.set(k, v);
  });
  if (!url.searchParams.get("sort")) url.searchParams.set("sort", "-CreatedAt");
  const res  = await fetch(url.toString(), { headers: { "xc-token": TOKEN } });
  const data = await res.json();
  return NextResponse.json(data);
}
