import { NextRequest, NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_CONCIERGES_TABLE_ID ?? "";

export async function GET() {
  if (!TBL) return NextResponse.json({ list: [], pageInfo: { totalRows: 0 } });
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=100&sort=-is_main`;
  const res = await fetch(url, { headers: { "xc-token": TOKEN } });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  console.log("[concierge] create started");
  if (!TBL) {
    console.error("[concierge] create failed: NOCODB_CONCIERGES_TABLE_ID not set");
    return NextResponse.json({ error: "NOCODB_CONCIERGES_TABLE_ID not set" }, { status: 503 });
  }
  const body = await req.json();
  console.log("[concierge] create payload:", JSON.stringify(body));
  const nocoPayload = {
    concierge_key:               body.concierge_key,
    display_name:                body.display_name,
    description:                 body.description ?? null,
    intercom_admin_id:           body.intercom_admin_id ?? null,
    persona_label:               body.persona_label ?? null,
    policy_set_key:              body.policy_set_key ?? null,
    skill_profile_key:           body.skill_profile_key ?? null,
    source_priority_profile_key: body.source_priority_profile_key ?? null,
    is_active:                   body.is_active ?? true,
    is_main:                     body.is_main ?? false,
    is_test_only:                body.is_test_only ?? false,
    notes:                       body.notes ?? null,
  };
  console.log("[concierge] create nocodb payload:", JSON.stringify(nocoPayload));
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "POST",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(nocoPayload),
  });
  const data = await res.json();
  if (res.ok) {
    console.log("[concierge] create succeeded, Id:", data?.Id);
  } else {
    console.error("[concierge] create failed, status:", res.status, "body:", JSON.stringify(data));
  }
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_CONCIERGES_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_CONCIERGES_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "DELETE",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
