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

  // plan: custom_attributes.plan でコンタクト検索 → ユニークなプラン値を返す
  if (type === "plan") {
    if (q.length < 1) return NextResponse.json({ results: [] });
    const res = await fetch(`${IC_BASE}/contacts/search`, {
      method: "POST",
      headers: icHeaders,
      body: JSON.stringify({
        query: { field: "custom_attributes.plan", operator: "~", value: q },
        pagination: { per_page: 50 },
      }),
    });
    if (!res.ok) return NextResponse.json({ results: [] }, { status: res.status });
    const data = await res.json();
    const contacts = (data.data ?? []) as Record<string, unknown>[];
    // ユニークなプラン値に集約
    const planCounts = new Map<string, number>();
    for (const c of contacts) {
      const attrs = c.custom_attributes as Record<string, unknown> | null | undefined;
      const plan = attrs?.plan;
      if (plan && typeof plan === "string" && plan.trim()) {
        planCounts.set(plan.trim(), (planCounts.get(plan.trim()) ?? 0) + 1);
      }
    }
    const results = Array.from(planCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([plan, count]) => ({
        value: plan,
        label: plan,
        sub:   `${count}件のコンタクト`,
      }));
    return NextResponse.json({ results });
  }

  // domain: メールアドレスでコンタクト検索 → ユニークなドメインを返す
  if (type === "domain") {
    if (q.length < 2) return NextResponse.json({ results: [] });
    const res = await fetch(`${IC_BASE}/contacts/search`, {
      method: "POST",
      headers: icHeaders,
      body: JSON.stringify({
        query: { field: "email", operator: "~", value: q },
        pagination: { per_page: 50 },
      }),
    });
    if (!res.ok) return NextResponse.json({ results: [] }, { status: res.status });
    const data = await res.json();
    const contacts = (data.data ?? []) as Record<string, unknown>[];
    // メールからドメインを抽出してユニーク化
    const domainCounts = new Map<string, number>();
    for (const c of contacts) {
      const email = c.email;
      if (email && typeof email === "string") {
        const parts = email.split("@");
        const domain = parts[1]?.toLowerCase();
        if (domain) domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
      }
    }
    const results = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({
        value: domain,
        label: domain,
        sub:   `${count}件のコンタクト`,
      }));
    return NextResponse.json({ results });
  }

  return NextResponse.json({ results: [] });
}
