import { NextRequest, NextResponse } from "next/server";

const BASE  = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;
const TBL   = process.env.NOCODB_WORKFLOWS_TABLE_ID ?? "";

export async function GET() {
  if (!TBL) return NextResponse.json({ list: [], pageInfo: { totalRows: 0 } });
  const url = `${BASE}/api/v2/tables/${TBL}/records?limit=100&sort=-UpdatedAt`;
  const res = await fetch(url, { headers: { "xc-token": TOKEN }, cache: "no-store" });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_WORKFLOWS_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  const payload = {
    workflow_key:        body.workflow_key,
    display_name:        body.display_name,
    description:         body.description ?? null,
    status:              body.status ?? "draft",
    scope_type:          body.scope_type ?? "global",
    scope_value:         body.scope_value ?? null,
    root_concierge_key:  body.root_concierge_key ?? null,
    routing_config_json: body.routing_config_json  ?? null,
    skill_config_json:   body.skill_config_json    ?? null,
    handoff_config_json: body.handoff_config_json  ?? null,
    policy_config_json:  body.policy_config_json   ?? null,
    source_config_json:  body.source_config_json   ?? null,
    intents_config_json: body.intents_config_json  ?? null,
    notes:               body.notes ?? null,
  };
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "POST",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function PATCH(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_WORKFLOWS_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();

  // Auto-pause other active workflows in same scope when activating
  if (body.status === "active" && body.Id) {
    const currentRes = await fetch(
      `${BASE}/api/v2/tables/${TBL}/records/${body.Id}`,
      { headers: { "xc-token": TOKEN }, cache: "no-store" },
    );
    if (currentRes.ok) {
      const current = await currentRes.json();
      const scopeType  = body.scope_type  ?? current.scope_type  ?? "global";
      const scopeValue = body.scope_value ?? current.scope_value ?? null;
      const whereClause = scopeValue
        ? `(status,eq,active)~and(scope_type,eq,${scopeType})~and(scope_value,eq,${scopeValue})~and(Id,neq,${body.Id})`
        : `(status,eq,active)~and(scope_type,eq,${scopeType})~and(Id,neq,${body.Id})`;
      const conflictsRes = await fetch(
        `${BASE}/api/v2/tables/${TBL}/records?where=${encodeURIComponent(whereClause)}&limit=50`,
        { headers: { "xc-token": TOKEN }, cache: "no-store" },
      );
      if (conflictsRes.ok) {
        const conflicts = await conflictsRes.json();
        for (const wf of (conflicts.list ?? [])) {
          await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
            method: "PATCH",
            headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ Id: wf.Id, status: "paused" }),
          });
        }
      }
    }
  }

  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function DELETE(req: NextRequest) {
  if (!TBL) return NextResponse.json({ error: "NOCODB_WORKFLOWS_TABLE_ID not set" }, { status: 503 });
  const body = await req.json();
  // Archive instead of hard delete
  const res = await fetch(`${BASE}/api/v2/tables/${TBL}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: body.Id, status: "archived" }),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
