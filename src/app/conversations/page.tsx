"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";
import type { Session } from "@/lib/nocodb";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

const CATEGORIES = ["", "experience_issue", "usage_guidance", "bug_report", "tracking_issue", "billing_contract", "login_account", "report_difference"];
const SOURCES    = ["", "faq_answer", "help_center_answer", "known_bug_match", "next_message", "handoff", "escalation", "fallback"];

export default function ConversationsPage() {
  const router = useRouter();
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [category, setCategory]   = useState("");
  const [source, setSource]       = useState("");
  const [loading, setLoading]     = useState(true);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    const parts: string[] = [];
    if (category) parts.push(`(category,eq,${category})`);
    if (source)   parts.push(`(reply_source,eq,${source})`);
    const where = parts.length ? parts.join("~and") : "";
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort: "-CreatedAt",
      ...(where ? { where } : {}),
    });
    const res = await fetch(`/api/sessions?${params}`);
    const data = await res.json();
    setSessions(data.list ?? []);
    setTotal(data.pageInfo?.totalRows ?? 0);
    setLoading(false);
  }, [page, category, source]);

  useEffect(() => { setPage(0); }, [category, source]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Conversations</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">全 {total.toLocaleString()} 件</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <select
          value={category} onChange={e => setCategory(e.target.value)}
          className="h-8 text-sm px-2.5 rounded-md border border-[var(--border)] bg-white text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-zinc-300"
        >
          <option value="">Intent: すべて</option>
          {CATEGORIES.slice(1).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={source} onChange={e => setSource(e.target.value)}
          className="h-8 text-sm px-2.5 rounded-md border border-[var(--border)] bg-white text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-zinc-300"
        >
          <option value="">Source: すべて</option>
          {SOURCES.slice(1).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              {["日時", "メッセージ", "Intent", "Skill", "Reply Source", "Conf.", "Slots", "Status"].map(h => (
                <Th key={h}>{h}</Th>
              ))}
            </tr>
          </Thead>
          <Tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <Td key={j}><div className="h-4 bg-zinc-100 rounded animate-pulse w-16" /></Td>
                    ))}
                  </Tr>
                ))
              : sessions.map(s => {
                  const acj = s.answer_candidate_json ? (() => { try { return JSON.parse(s.answer_candidate_json!); } catch { return null; } })() : null;
                  return (
                    <Tr key={s.Id} onClick={() => router.push(`/conversations/${s.session_uid}`)}>
                      <Td className="text-xs text-[var(--text-muted)]">{formatDate(s.CreatedAt)}</Td>
                      <Td className="max-w-[200px] text-[var(--text-primary)]">{truncate(s.latest_user_message, 45)}</Td>
                      <Td>{categoryBadge(s.category)}</Td>
                      <Td><span className="text-xs text-[var(--text-muted)]">{s.selected_skill ?? "—"}</span></Td>
                      <Td>{replySourceBadge(s.reply_source)}</Td>
                      <Td className="text-xs tabular-nums text-[var(--text-muted)]">
                        {acj?.confidence != null ? (acj.confidence * 100).toFixed(0) + "%" : "—"}
                      </Td>
                      <Td className="text-xs tabular-nums text-[var(--text-muted)]">
                        {s.filled_slots_count}/{(s.filled_slots_count ?? 0) + (s.missing_slots_count ?? 0)}
                      </Td>
                      <Td>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border ${
                          s.status === "handed_off" || s.status === "answered" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : s.status === "collecting" ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-zinc-50 text-zinc-600 border-zinc-200"
                        }`}>{s.status ?? "—"}</span>
                      </Td>
                    </Tr>
                  );
                })}
          </Tbody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--text-muted)]">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
              <ChevronLeft size={13} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total}>
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
