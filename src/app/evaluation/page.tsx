"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";
import type { Session } from "@/lib/nocodb";
import { ThumbsUp, ThumbsDown, RefreshCw } from "lucide-react";

export default function EvaluationPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<"all" | "good" | "bad" | "unrated">("unrated");
  const [stats, setStats]       = useState({ good: 0, bad: 0, unrated: 0 });

  // カウントはフィルタと独立して NocoDB の totalRows から取得する
  const loadStats = async () => {
    const [g, b, u] = await Promise.all([
      fetch("/api/sessions?limit=1&where=(evaluation,eq,good)").then(r => r.json()),
      fetch("/api/sessions?limit=1&where=(evaluation,eq,bad)").then(r => r.json()),
      fetch("/api/sessions?limit=1&where=(evaluation,blank,true)").then(r => r.json()),
    ]);
    setStats({
      good:    g.pageInfo?.totalRows ?? 0,
      bad:     b.pageInfo?.totalRows ?? 0,
      unrated: u.pageInfo?.totalRows ?? 0,
    });
  };

  const load = async () => {
    setLoading(true);
    let where = "";
    if (filter === "good")    where = "(evaluation,eq,good)";
    if (filter === "bad")     where = "(evaluation,eq,bad)";
    if (filter === "unrated") where = "(evaluation,blank,true)";
    const params = new URLSearchParams({ limit: "100", sort: "-CreatedAt", ...(where ? { where } : {}) });
    const res  = await fetch(`/api/sessions?${params}`);
    const data = await res.json();
    setSessions(data.list ?? []);
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="p-6 max-w-[1200px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Evaluation</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">会話の評価と改善ループ</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadStats(); load(); }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> 更新
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { key: "good",    label: "Good",    icon: ThumbsUp,   color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { key: "bad",     label: "Bad",     icon: ThumbsDown, color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200" },
          { key: "unrated", label: "Unrated", icon: null,       color: "text-zinc-500",    bg: "bg-zinc-50",    border: "border-zinc-200" },
        ].map(({ key, label, icon: Icon, color, bg, border }) => (
          <button key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`rounded-lg border p-4 text-left transition-all ${
              filter === key ? `${bg} ${border} ring-1 ring-offset-0` : "bg-white border-[var(--border)] hover:border-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {Icon && <Icon size={14} className={color} />}
              <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${color}`}>{stats[key as keyof typeof stats]}</p>
          </button>
        ))}
      </div>

      <Card>
        <Table>
          <Thead>
            <tr>
              {["日時", "メッセージ", "Intent", "Source", "評価", "理由", ""].map(h => <Th key={h}>{h}</Th>)}
            </tr>
          </Thead>
          <Tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <Td key={j}><div className="h-4 bg-zinc-100 rounded animate-pulse w-16" /></Td>
                    ))}
                  </Tr>
                ))
              : sessions.map(s => (
                  <Tr key={s.Id}>
                    <Td className="text-xs text-[var(--text-muted)]">{formatDate(s.CreatedAt)}</Td>
                    <Td className="max-w-[200px] text-[var(--text-primary)]">{truncate(s.latest_user_message, 45)}</Td>
                    <Td>{categoryBadge(s.category)}</Td>
                    <Td>{replySourceBadge(s.reply_source)}</Td>
                    <Td>
                      {s.evaluation === "good" && (
                        <span className="flex items-center gap-1 text-xs text-emerald-700">
                          <ThumbsUp size={12} /> Good
                        </span>
                      )}
                      {s.evaluation === "bad" && (
                        <span className="flex items-center gap-1 text-xs text-red-700">
                          <ThumbsDown size={12} /> Bad
                        </span>
                      )}
                      {!s.evaluation && <span className="text-xs text-[var(--text-muted)]">—</span>}
                    </Td>
                    <Td className="text-xs text-[var(--text-muted)] max-w-[160px]">
                      {truncate(s.eval_reason, 40)}
                    </Td>
                    <Td>
                      <Button variant="ghost" size="sm"
                        onClick={() => router.push(`/conversations/${s.session_uid}`)}>
                        評価する →
                      </Button>
                    </Td>
                  </Tr>
                ))}
          </Tbody>
        </Table>
      </Card>
    </div>
  );
}
