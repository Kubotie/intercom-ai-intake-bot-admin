import { getSessions, getSessionStats } from "@/lib/nocodb";
import { StatCard, Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { formatDate, truncate } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  experience_issue:  "体験・表示問題",
  usage_guidance:    "使い方案内",
  bug_report:        "バグ報告",
  tracking_issue:    "計測問題",
  billing_contract:  "請求・契約",
  login_account:     "ログイン",
  report_difference: "数値差異",
};

const SOURCE_LABELS: Record<string, string> = {
  faq_answer:         "FAQ 回答",
  help_center_answer: "Help Center",
  known_bug_match:    "既知バグ",
  next_message:       "追加質問",
  handoff:            "Handoff",
  escalation:         "Escalation",
  fallback:           "Fallback",
};

export default async function OverviewPage() {
  const [stats, recent] = await Promise.all([
    getSessionStats(),
    getSessions({ limit: 10 }),
  ]);

  const skillAdopted = (stats.byReplySource["faq_answer"] ?? 0)
    + (stats.byReplySource["help_center_answer"] ?? 0)
    + (stats.byReplySource["known_bug_match"] ?? 0);
  const adoptRate = stats.total > 0 ? Math.round(skillAdopted / Math.min(stats.total, 200) * 100) : 0;
  const handoffRate = stats.total > 0 ? Math.round(stats.handedOff / Math.min(stats.total, 200) * 100) : 0;
  const escalateRate = stats.total > 0 ? Math.round(stats.escalated / Math.min(stats.total, 200) * 100) : 0;

  return (
    <div className="p-6 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Overview</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">AI 対応状況のサマリ（直近200件ベース）</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="総セッション数" value={stats.total.toLocaleString()} />
        <StatCard label="Skill 採用率" value={`${adoptRate}%`} sub={`${skillAdopted} 件`} accent="text-blue-600" />
        <StatCard label="Handoff 率" value={`${handoffRate}%`} sub={`${stats.handedOff} 件`} accent="text-amber-600" />
        <StatCard label="Escalation 率" value={`${escalateRate}%`} sub={`${stats.escalated} 件`} accent="text-red-600" />
      </div>

      {/* Category + Source breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Intent 分布</CardTitle></CardHeader>
          <CardContent className="p-0">
            {Object.entries(stats.byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, count]) => {
                const pct = Math.round(count / Math.min(stats.total, 200) * 100);
                return (
                  <div key={cat} className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)] last:border-0">
                    <div className="w-32 shrink-0">{categoryBadge(cat)}</div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] w-16 text-right tabular-nums">{count}件 ({pct}%)</span>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Reply Source 分布</CardTitle></CardHeader>
          <CardContent className="p-0">
            {Object.entries(stats.byReplySource)
              .sort(([, a], [, b]) => b - a)
              .map(([src, count]) => {
                const pct = Math.round(count / Math.min(stats.total, 200) * 100);
                return (
                  <div key={src} className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-subtle)] last:border-0">
                    <div className="w-40 shrink-0">{replySourceBadge(src)}</div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-[var(--text-muted)] w-16 text-right tabular-nums">{count}件 ({pct}%)</span>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      {/* Recent conversations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>最近の会話</CardTitle>
          <Link href="/conversations" className="text-xs text-blue-600 hover:underline">すべて見る →</Link>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                {["日時", "メッセージ", "Intent", "Reply Source", "Confidence", "Status"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {recent.list.map(s => {
                const acj = s.answer_candidate_json ? (() => { try { return JSON.parse(s.answer_candidate_json!); } catch { return null; } })() : null;
                return (
                  <tr key={s.Id} className="hover:bg-zinc-50 cursor-pointer">
                    <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap text-xs">{formatDate(s.CreatedAt)}</td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <Link href={`/conversations/${s.session_uid}`} className="text-[var(--text-primary)] hover:underline">
                        {truncate(s.latest_user_message, 50)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{categoryBadge(s.category)}</td>
                    <td className="px-4 py-3">{replySourceBadge(s.reply_source)}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[var(--text-muted)]">
                      {acj?.confidence != null ? (acj.confidence * 100).toFixed(0) + "%" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        s.status === "handed_off" || s.status === "answered"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : s.status === "collecting"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-zinc-50 text-zinc-600 border-zinc-200"
                      }`}>{s.status ?? "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
