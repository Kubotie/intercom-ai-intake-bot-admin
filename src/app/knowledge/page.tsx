"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";
import type { KnowledgeChunk, KnowledgeSource } from "@/lib/nocodb";
import { RefreshCw, ChevronLeft, ChevronRight, BookOpen, Database, Clock, Upload, Search, ChevronDown, AlertTriangle, ArrowRight, Zap } from "lucide-react";

const SOURCE_TYPES = ["", "notion_faq", "notion_faq2", "help_center"];

export default function KnowledgePage() {
  const [fromSandbox,    setFromSandbox]    = useState(false);
  const [rootCause,      setRootCause]      = useState("");
  const [actionType,     setActionType]     = useState("");
  const [actionContent,  setActionContent]  = useState("");

  const [chunks, setChunks]       = useState<KnowledgeChunk[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [sourceType, setSourceType] = useState("");
  const [pubOnly, setPubOnly]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [sources, setSources]       = useState<KnowledgeSource[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [syncingType,  setSyncingType]  = useState<string | null>(null);
  const [syncResult,   setSyncResult]   = useState<{ type: string; ok: boolean; message: string; detail?: string } | null>(null);
  const [searchText,   setSearchText]   = useState("");
  const [searchInput,  setSearchInput]  = useState("");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const loadSources = async () => {
    const [srcRes, countResults] = await Promise.all([
      fetch("/api/knowledge-sources").then(r => r.json()),
      Promise.all(
        SOURCE_TYPES.slice(1).map(t =>
          fetch(`/api/chunks?limit=1&where=(source_type,eq,${t})`)
            .then(r => r.json())
            .then(d => [t, d.pageInfo?.totalRows ?? 0] as [string, number])
        )
      ),
    ]);
    setSources(srcRes.list ?? []);
    setSourceCounts(Object.fromEntries(countResults));
  };

  const load = async () => {
    setLoading(true);
    const parts: string[] = [];
    if (sourceType) parts.push(`(source_type,eq,${sourceType})`);
    if (pubOnly)    parts.push(`(published_to_bot,eq,true)`);
    if (searchText) parts.push(`(title,like,%${searchText}%)~or(body,like,%${searchText}%)`);
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

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setFromSandbox(p.get("from") === "sandbox");
    setRootCause(p.get("root_cause") ?? "");
    setActionType(p.get("action_type") ?? "");
    setActionContent(p.get("action_content") ?? "");
  }, []);
  useEffect(() => { loadSources(); }, []);
  useEffect(() => { setPage(0); }, [sourceType, pubOnly, searchText]);
  useEffect(() => { load(); }, [page, sourceType, pubOnly, searchText]);

  const syncSource = async (type: string) => {
    setSyncingType(type);
    setSyncResult(null);
    try {
      const res  = await fetch("/api/knowledge/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: type }),
      });
      const data = await res.json();
      if (data.ok) {
        const detail = [
          data.fetched  != null ? `取得: ${data.fetched}` : null,
          data.created  != null ? `新規: ${data.created}` : null,
          data.updated  != null ? `更新: ${data.updated}` : null,
          data.skipped  != null ? `スキップ: ${data.skipped}` : null,
          data.failed   != null && data.failed > 0 ? `失敗: ${data.failed}` : null,
        ].filter(Boolean).join(" / ");
        setSyncResult({ type, ok: true, message: "同期完了", detail });
        await loadSources();
        load();
      } else {
        setSyncResult({ type, ok: false, message: data.error ?? "同期失敗" });
      }
    } catch (err) {
      setSyncResult({ type, ok: false, message: String(err) });
    } finally {
      setSyncingType(null);
    }
  };

  const getSource = (type: string) => sources.find(s => s.source_type === type);

  const sourceColor: Record<string, string> = {
    notion_faq:  "purple",
    help_center: "info",
    known_issue: "warning",
    notion_cse:  "muted",
  };

  const freshnessColor = (status: string | null) => {
    if (status === "fresh") return "text-emerald-600";
    if (status === "stale") return "text-amber-600";
    return "text-zinc-400";
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
        <Button variant="outline" size="sm" onClick={() => { loadSources(); load(); }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新
        </Button>
      </div>

      {/* Sandbox コンテキストバナー */}
      {fromSandbox && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {actionType === "update_knowledge" ? "ナレッジの内容を修正する必要があります"
                  : actionType === "add_faq" ? "FAQ チャンクの追加が必要です"
                  : rootCause === "missing_faq" ? "FAQ チャンクの追加が必要です"
                  : "ナレッジの更新が必要です"}
              </p>
              <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                Sandbox の改善提案に基づいて、このページで Knowledge を更新してください。
              </p>
            </div>
          </div>

          {actionContent && (
            <div className="bg-white rounded-md border border-amber-200 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Sandbox が提案した修正内容</p>
              <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{actionContent}</p>
            </div>
          )}

          <div className="bg-white rounded-md border border-amber-200 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">対応手順</p>
            <ol className="text-xs text-zinc-700 space-y-2 list-none">
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                <span>
                  {actionType === "update_knowledge"
                    ? <><strong>既存チャンクを修正する場合：</strong>下の検索で対象チャンクを見つけて「編集」し、上の提案内容を反映する</>
                    : <><strong>Notion FAQ に追加する場合：</strong>Notion の FAQ データベースに Q&amp;A を追加し、上の「Notion FAQ → 今すぐ同期」ボタンで同期してください</>
                  }
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                <span><strong>同期後：</strong>このページで対象のタイトルを検索して、チャンクが追加・更新されていることを確認</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                <span>Sandbox で同じシナリオを再実行して改善を確認</span>
              </li>
            </ol>
          </div>
          <a href="/sandbox"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-50 font-medium transition-colors">
            <Zap size={12} /> Sandbox に戻る <ArrowRight size={11} />
          </a>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "FAQ",                   type: "notion_faq2", icon: Database, color: "text-emerald-600", syncable: true },
          { label: "トラブルシューティング", type: "notion_faq",  icon: Database, color: "text-purple-600",  syncable: true },
          { label: "Help Center",           type: "help_center", icon: BookOpen,  color: "text-blue-600",    syncable: true },
        ].map(({ label, type, icon: Icon, color, syncable }) => {
          const src = getSource(type);
          const isSyncing = syncingType === type;
          return (
            <div
              key={type}
              className={`bg-white border rounded-lg p-4 transition-colors ${
                sourceType === type ? "border-zinc-400 ring-1 ring-zinc-300" : "border-[var(--border)]"
              }`}
            >
              <button
                className="w-full text-left"
                onClick={() => setSourceType(sourceType === type ? "" : type)}
              >
                <Icon size={16} className={`mb-1 ${color}`} />
                <p className="text-xs text-[var(--text-muted)] font-medium">{label}</p>
                <p className="text-lg font-semibold tabular-nums text-[var(--text-primary)] mt-0.5">
                  {sourceCounts[type]?.toLocaleString() ?? "—"}
                </p>
                {src && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={10} className={freshnessColor(src.freshness_status)} />
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {src.last_synced_at ? formatDate(src.last_synced_at) : "未同期"}
                    </span>
                    {src.sync_enabled === false && (
                      <span className="text-[10px] text-zinc-400 ml-1">（同期無効）</span>
                    )}
                  </div>
                )}
              </button>
              {syncable && (
                <button
                  onClick={() => syncSource(type)}
                  disabled={isSyncing || syncingType !== null}
                  className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] py-1 rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 disabled:opacity-40 transition-colors"
                >
                  {isSyncing
                    ? <><RefreshCw size={10} className="animate-spin" /> 同期中…</>
                    : <><Upload size={10} /> 今すぐ同期</>}
                </button>
              )}
              {syncResult?.type === type && (
                <div className="mt-1 text-center">
                  <p className={`text-[10px] font-medium ${syncResult.ok ? "text-emerald-600" : "text-red-500"}`}>
                    {syncResult.message}
                  </p>
                  {syncResult.detail && (
                    <p className="text-[9px] text-zinc-400 mt-0.5">{syncResult.detail}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {/* テキスト検索 */}
        <div className="flex gap-1.5 flex-1 min-w-[200px] max-w-xs">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") setSearchText(searchInput.trim()); }}
            placeholder="タイトル・本文を検索"
            className="flex-1 h-8 px-2.5 rounded-md border border-[var(--border)] bg-white text-sm text-[var(--text-primary)] outline-none"
          />
          <button
            onClick={() => setSearchText(searchInput.trim())}
            className="h-8 px-2.5 rounded-md border border-[var(--border)] bg-white hover:bg-zinc-50 text-zinc-500 flex items-center gap-1 text-xs"
          >
            <Search size={12} /> 検索
          </button>
          {searchText && (
            <button
              onClick={() => { setSearchText(""); setSearchInput(""); }}
              className="h-8 px-2 rounded-md text-xs text-zinc-400 hover:text-zinc-700"
            >
              ✕
            </button>
          )}
        </div>
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
              {["Source", "Title / Body", "Tags", "Published", "Active", "Updated"].map(h => <Th key={h}>{h}</Th>)}
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
              : chunks.map(c => {
                  const rowId = String(c.chunk_id || c.Id);
                  const isExpanded = expandedId === rowId;
                  return (
                    <>
                      <Tr key={rowId} className={isExpanded ? "bg-zinc-50" : undefined}>
                        <Td>
                          <Badge variant={(sourceColor[c.source_type] as "purple" | "info" | "warning" | "muted") ?? "default"}>
                            {c.source_type}
                          </Badge>
                        </Td>
                        <Td className="max-w-[340px]">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : rowId)}
                            className="flex items-start gap-1 text-left w-full group"
                          >
                            <ChevronDown
                              size={12}
                              className={`mt-0.5 shrink-0 text-zinc-400 transition-transform group-hover:text-zinc-600 ${isExpanded ? "rotate-180" : ""}`}
                            />
                            <span className="text-xs text-[var(--text-primary)] leading-snug">{truncate(c.title, 70)}</span>
                          </button>
                        </Td>
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
                      {isExpanded && (
                        <Tr key={`${rowId}-body`}>
                          <Td colSpan={6} className="bg-zinc-50 border-t-0">
                            <pre className="text-[11px] font-mono text-zinc-600 whitespace-pre-wrap leading-relaxed bg-white border border-zinc-100 rounded p-3 max-h-48 overflow-y-auto">
                              {c.body || "(本文なし)"}
                            </pre>
                          </Td>
                        </Tr>
                      )}
                    </>
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
  );
}
