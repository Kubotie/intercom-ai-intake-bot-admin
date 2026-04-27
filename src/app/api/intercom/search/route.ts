import { NextRequest, NextResponse } from "next/server";

const IC_BASE  = process.env.INTERCOM_API_BASE_URL ?? "https://api.intercom.io";
const IC_TOKEN = process.env.INTERCOM_ACCESS_TOKEN!;

const icHeaders = {
  Authorization:  `Bearer ${IC_TOKEN}`,
  "Content-Type": "application/json",
  Accept:         "application/json",
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const q    = (searchParams.get("q") ?? "").trim();

  if (!IC_TOKEN) return NextResponse.json({ error: "INTERCOM_ACCESS_TOKEN not set" }, { status: 503 });

  // contact / email: Intercom contacts search
  if (type === "contact" || type === "email") {
    if (q.length < 2) return NextResponse.json({ results: [] });
    const res = await fetch(`${IC_BASE}/contacts/search`, {
      method: "POST",
      headers: icHeaders,
      body: JSON.stringify({
        query: {
          operator: "OR",
          value: [
            { field: "name",  operator: "~", value: q },
            { field: "email", operator: "~", value: q },
          ],
        },
        pagination: { per_page: 10 },
      }),
    });
    if (!res.ok) return NextResponse.json({ results: [] }, { status: res.status });
    const data = await res.json();
    const results = (data.data ?? []).map((c: Record<string, unknown>) => ({
      value: type === "email" ? String(c.email ?? "") : String(c.id ?? ""),
      label: `${c.name ?? "(名前なし)"}  ${c.email ?? ""}`,
      sub:   String(c.id ?? ""),
    }));
    return NextResponse.json({ results });
  }

  // company: Intercom companies search
  if (type === "company") {
    if (q.length < 2) return NextResponse.json({ results: [] });
    const res = await fetch(`${IC_BASE}/companies/search`, {
      method: "POST",
      headers: icHeaders,
      body: JSON.stringify({
        query: { field: "name", operator: "~", value: q },
        pagination: { per_page: 10 },
      }),
    });
    if (!res.ok) return NextResponse.json({ results: [] }, { status: res.status });
    const data = await res.json();
    const results = (data.data ?? []).map((c: Record<string, unknown>) => ({
      value: String(c.id ?? ""),
      label: String(c.name ?? "(名前なし)"),
      sub:   `ID: ${c.id}`,
    }));
    return NextResponse.json({ results });
  }

  // conversation: 最近の会話一覧（クエリなしで取得 → 前方一致フィルタはクライアント側）
  if (type === "conversation") {
    const res = await fetch(
      `${IC_BASE}/conversations?order=updated_at&sort=desc&per_page=20`,
      { headers: icHeaders },
    );
    if (!res.ok) return NextResponse.json({ results: [] }, { status: res.status });
    const data = await res.json();
    const all = (data.conversations ?? []).map((c: Record<string, unknown>) => {
      const source = c.source as Record<string, unknown> | undefined;
      const author = source?.author as Record<string, unknown> | undefined;
      return {
        value: String(c.id ?? ""),
        label: String(source?.subject ?? author?.name ?? `会話 ${c.id}`),
        sub:   `ID: ${c.id}`,
      };
    });
    // クエリがあれば ID 前方一致でフィルタ
    const results = q ? all.filter((r: { value: string }) => r.value.startsWith(q)) : all;
    return NextResponse.json({ results });
  }

  return NextResponse.json({ results: [] });
}
