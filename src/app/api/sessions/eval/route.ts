import { NextRequest, NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_SESSIONS_TABLE_ID!;

export async function POST(req: NextRequest) {
  const { rowId, evaluation, evalReason } = await req.json();
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId, evaluation, eval_reason: evalReason }),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.ok ? 200 : 500 });
}
