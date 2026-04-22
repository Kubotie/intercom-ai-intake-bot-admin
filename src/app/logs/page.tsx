"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { formatDate, truncate, safeJson } from "@/lib/utils";
import type { Session } from "@/lib/nocodb";
import { RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

type AcjType = {
  confidence?: number; retrieval_query?: string;
  candidate_titles?: string[]; candidate_chunk_ids?: string[];
  answer_type?: string; answer_message?: string;
};

export default function LogsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [selected, setSelected] = useState<Session | null>(null);
  const [loading, setLoading]   = useState(true);
  const PAGE_SIZE = 50;

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), sort: "-CreatedAt" });
    const res  = await fetch(`/api/sessions?${params}`);
    const data = await res.json();
    setSessions(data.list ?? []);
    setTotal(data.pageInfo?.totalRows ?? 0);
    setLoading(false);
  };

  useEffect(() => { load(); }, [page]);

  const acj = selected ? safeJson<AcjType>(selected.answer_candidate_json) : null;

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Logs / Traces</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">セッション別 AI 判断トレース — {total.toLocaleString()} 件</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新
        </Button>
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className={`${selected ? "w-1/2" : "w-full"} transition-all`}>
          <Card>
            <Table>
              <Thead>
                <tr>
                  {["日時", "会話ID", "Intent", "Source", "Conf.", "Trace"].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </Thead>
              <Tbody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <Tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <Td key={j}><div className="h-4 bg-zinc-100 rounded animate-pulse w-16" /></Td>
                        ))}
                      </Tr>
                    ))
                  : sessions.map(s => {
                      const a = safeJson<AcjType>(s.answer_candidate_json);
                      return (
                        <Tr key={s.Id}
                          onClick={() => setSelected(s.session_uid === selected?.session_uid ? null : s)}
                          className={s.session_uid === selected?.session_uid ? "bg-zinc-100" : ""}
                        >
                          <Td className="text-[10px] text-[var(--text-muted)]">{formatDate(s.CreatedAt)}</Td>
                          <Td>
                            <span className="text-[10px] font-mono text-[var(--text-muted)]">
                              {s.intercom_conversation_id?.slice(-8)}
                            </span>
                          </Td>
                          <Td>{categoryBadge(s.category)}</Td>
                          <Td>{replySourceBadge(s.reply_source)}</Td>
                          <Td className="text-xs tabular-nums text-[var(--text-muted)]">
                            {a?.confidence != null ? (a.confidence * 100).toFixed(0) + "%" : "—"}
                          </Td>
                          <Td className="max-w-[180px] text-[10px] font-mono text-[var(--text-muted)]">
                            {truncate(s.decision_trace, 40)}
                          </Td>
                        </Tr>
                      );
                    })}
              </Tbody>
            </Table>
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

        {/* Detail pane */}
        {selected && (
          <div className="w-1/2 space-y-3">
            <Card>
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">トレース詳細</h3>
                <a href={`/conversations/${selected.session_uid}`}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  詳細を見る <ExternalLink size={11} />
                </a>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">メッセージ</p>
                  <p className="text-xs text-[var(--text-secondary)]">{selected.latest_user_message ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Decision Trace</p>
                  <p className="text-xs font-mono text-[var(--text-secondary)] bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] break-all leading-relaxed">
                    {selected.decision_trace ?? "—"}
                  </p>
                </div>
                {acj?.retrieval_query && (
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Retrieval Query</p>
                    <p className="text-xs font-mono bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] break-all">
                      {String(acj.retrieval_query)}
                    </p>
                  </div>
                )}
                {acj?.candidate_titles && (
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Candidates</p>
                    <div className="space-y-1">
                      {(acj.candidate_titles as string[]).map((t, i) => (
                        <p key={i} className="text-xs text-[var(--text-secondary)] flex gap-1.5">
                          <span className="text-[var(--text-muted)]">{i + 1}.</span> {t}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">answer_candidate_json</p>
                  <pre className="text-[10px] text-[var(--text-muted)] bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] overflow-auto max-h-48 whitespace-pre-wrap break-all leading-relaxed">
                    {acj ? JSON.stringify(acj, null, 2) : "null"}
                  </pre>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
