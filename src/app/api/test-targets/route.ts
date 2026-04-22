import { NextRequest, NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_TEST_TARGETS_TABLE_ID ?? "";

export async function GET() {
  if (!TBL) return NextResponse.json({ list: [], pageInfo: { totalRows: 0 } });
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=100&sort=-CreatedAt`;
  const res = await fetch(url, { headers: { "xc-token": TOKEN } });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  console.log("[test-target] create started");
  if (!TBL) {
    console.error("[test-target] create failed: NOCODB_TEST_TARGETS_TABLE_ID not set");
    return NextResponse.json({ error: "NOCODB_TEST_TARGETS_TABLE_ID not set" }, { status: 503 });
  }
  const body = await req.json();
  console.log("[test-target] create payload:", JSON.stringify(body));
  const nocoPayload = {
    target_type:   body.target_type,
    target_value:  body.target_value,
    label:         body.label ?? null,
    environment:   body.environment ?? null,
    concierge_key: body.concierge_key ?? null,
    is_active:     body.is_active ?? true,
    notes:         body.notes ?? null,
  };
  console.log("[test-target] create nocodb payload:", JSON.stringify(nocoPayload));
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "POST",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(nocoPayload),
  });
  const data = await res.json();
  if (res.ok) {
    console.log("[test-target] create succeeded, Id:", data?.Id);
  } else {
    console.error("[test-target] create failed, status:", res.status, "body:", JSON.stringify(data));
  }
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_TEST_TARGETS_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_TEST_TARGETS_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "DELETE",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
