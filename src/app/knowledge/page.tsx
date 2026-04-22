"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";
import type { KnowledgeChunk } from "@/lib/nocodb";
import { RefreshCw, ChevronLeft, ChevronRight, BookOpen, Database } from "lucide-react";

const SOURCE_TYPES = ["", "notion_faq", "help_center", "known_issue", "notion_cse"];

export default function KnowledgePage() {
  const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(0);
  const [sourceType, setSourceType] = useState("");
  const [pubOnly, setPubOnly]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const PAGE_SIZE = 50;

  const load = async () => {
    setLoading(true);
    const parts: string[] = [];
    if (sourceType) parts.push(`(source_type,eq,${sourceType})`);
    if (pubOnly)    parts.push(`(published_to_bot,eq,true)`);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE),
      ...(parts.length ? { where: parts.join("~and") } : {}),
    });
    const res  = await fetch(`/api/chunks?${params}`);
    const data = await res.json();
    setChunks(data.list ?? []);
    setTotal(data.pageInfo?.totalRows ?? 0);
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [sourceType, pubOnly]);
  useEffect(() => { load(); }, [page, sourceType, pubOnly]);

  const sourceColor: Record<string, string> = {
    notion_faq:  "purple",
    help_center: "info",
    known_issue: "warning",
    notion_cse:  "muted",
  };

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Knowledge</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            ナレッジチャンク管理 — 全 {total.toLocaleString()} 件
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Notion FAQ",   type: "notion_faq",  icon: Database, color: "text-purple-600" },
          { label: "Help Center",  type: "help_center", icon: BookOpen,  color: "text-blue-600" },
          { label: "Known Issues", type: "known_issue", icon: Database, color: "text-amber-600" },
          { label: "CSE Cases",    type: "notion_cse",  icon: Database, color: "text-zinc-500" },
        ].map(({ label, type, icon: Icon, color }) => (
          <button
            key={type}
            onClick={() => setSourceType(sourceType === type ? "" : type)}
            className={`bg-white border rounded-lg p-4 text-left transition-colors ${
              sourceType === type ? "border-zinc-400 ring-1 ring-zinc-300" : "border-[var(--border)] hover:border-zinc-300"
            }`}
          >
            <Icon size={16} className={`mb-2 ${color}`} />
            <p className="text-xs text-[var(--text-muted)] font-medium">{label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select
          value={sourceType} onChange={e => setSourceType(e.target.value)}
          className="h-8 text-sm px-2.5 rounded-md border border-[var(--border)] bg-white text-[var(--text-primary)] outline-none"
        >
          <option value="">Source: すべて</option>
          {SOURCE_TYPES.slice(1).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={pubOnly} onChange={e => setPubOnly(e.target.checked)}
            className="rounded border-[var(--border)]" />
          published_to_bot のみ
        </label>
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              {["Source", "Title", "Tags", "Published", "Active", "Updated"].map(h => <Th key={h}>{h}</Th>)}
            </tr>
          </Thead>
          <Tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <Td key={j}><div className="h-4 bg-zinc-100 rounded animate-pulse w-20" /></Td>
                    ))}
                  </Tr>
                ))
              : chunks.map(c => (
                  <Tr key={c.Id}>
                    <Td>
                      <Badge variant={(sourceColor[c.source_type] as "purple" | "info" | "warning" | "muted") ?? "default"}>
                        {c.source_type}
                      </Badge>
                    </Td>
                    <Td className="max-w-[300px] text-[var(--text-primary)]">{truncate(c.title, 70)}</Td>
                    <Td className="text-xs text-[var(--text-muted)]">{truncate(c.tags, 40)}</Td>
                    <Td>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${
                        c.published_to_bot ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"
                      }`}>{c.published_to_bot ? "✓" : "—"}</span>
                    </Td>
                    <Td>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded border ${
                        c.is_active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"
                      }`}>{c.is_active ? "✓" : "—"}</span>
                    </Td>
                    <Td className="text-xs text-[var(--text-muted)]">{formatDate(c.updated_at ?? c.CreatedAt)}</Td>
                  </Tr>
                ))}
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
  );
}
