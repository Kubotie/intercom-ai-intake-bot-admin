import { getSession, getMessages } from "@/lib/nocodb";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { formatDate, safeJson, truncate } from "@/lib/utils";
import { EvalPanel } from "./eval-panel";
import { User, Bot, ArrowRight } from "lucide-react";

export const revalidate = 0;

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, messages] = await Promise.all([
    getSession(id),
    getMessages(id),
  ]);
  if (!session) return notFound();

  type AcjType = {
    confidence?: number; retrieval_query?: string; candidate_titles?: string[];
    candidate_chunk_ids?: string[]; answer_type?: string; answer_message?: string;
    skill_candidates?: Array<{ skill_name: string; accepted: boolean; confidence: number; rejection_reason: string | null }>;
  };
  const acj = safeJson<AcjType>(session.answer_candidate_json);
  const skillCandidates = acj?.skill_candidates ?? [];

  return (
    <div className="p-6 max-w-[1400px]">
      <div className="mb-5">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] mb-1">
          <a href="/conversations" className="hover:underline">Conversations</a>
          <ArrowRight size={11} />
          <span className="font-mono">{session.intercom_conversation_id}</span>
        </div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {truncate(session.latest_user_message, 80)}
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{formatDate(session.CreatedAt)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Timeline */}
        <div className="lg:col-span-1 space-y-2">
          <Card>
            <CardHeader><CardTitle>会話タイムライン</CardTitle></CardHeader>
            <CardContent className="p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">メッセージなし</p>
              )}
              {messages.map(m => (
                <div key={m.Id} className={`flex gap-2.5 ${m.role === "user" ? "" : "flex-row-reverse"}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    m.role === "user" ? "bg-zinc-200" : "bg-zinc-800"
                  }`}>
                    {m.role === "user"
                      ? <User size={11} className="text-zinc-600" />
                      : <Bot size={11} className="text-white" />}
                  </div>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-zinc-100 text-[var(--text-primary)]"
                      : "bg-zinc-800 text-white"
                  }`}>
                    {m.message_text ?? <span className="italic text-[var(--text-muted)]">(no text)</span>}
                  </div>
                </div>
              ))}
              {/* Bot の返信プレビューを最後のターンとして表示 */}
              {session.reply_preview && (
                <div className="flex gap-2.5 flex-row-reverse">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-zinc-800">
                    <Bot size={11} className="text-white" />
                  </div>
                  <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-zinc-800 text-white whitespace-pre-wrap">
                    {session.reply_preview}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Center: AI Decision */}
        <div className="lg:col-span-1 space-y-3">
          <Card>
            <CardHeader><CardTitle>AI 判断サマリ</CardTitle></CardHeader>
            <CardContent className="p-0">
              {([
                ["Intent",        categoryBadge(session.category)],
                ["Reply Source",  replySourceBadge(session.reply_source)],
                ["Selected Skill",<span className="text-xs font-mono">{session.selected_skill ?? "—"}</span>],
                ["Confidence",    acj?.confidence != null ? <span className="text-xs tabular-nums">{((acj.confidence as number) * 100).toFixed(0)}%</span> : <span className="text-xs text-[var(--text-muted)]">—</span>],
                ["Filled Slots",  <span className="text-xs tabular-nums">{session.filled_slots_count ?? 0}</span>],
                ["Missing Slots", <span className="text-xs tabular-nums text-amber-600">{session.missing_slots_count ?? 0}</span>],
                ["Status",        <span className="text-xs">{session.status ?? "—"}</span>],
              ] as [string, React.ReactNode][]).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                  <span className="text-xs text-[var(--text-muted)] w-28 shrink-0">{label}</span>
                  <div>{val}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Retrieval */}
          {acj?.retrieval_query && (
            <Card>
              <CardHeader><CardTitle>検索クエリ</CardTitle></CardHeader>
              <CardContent className="p-4 space-y-2">
                <div className="text-xs font-mono bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] break-all">
                  {String(acj.retrieval_query)}
                </div>
                {acj.candidate_titles && (
                  <div className="space-y-1 mt-2">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">候補</p>
                    {(acj.candidate_titles as string[]).map((t, i) => (
                      <div key={i} className="text-xs text-[var(--text-secondary)] flex gap-1.5">
                        <span className="text-[var(--text-muted)]">{i + 1}.</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Skill Candidates */}
          {skillCandidates.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Skill 試行結果</CardTitle></CardHeader>
              <CardContent className="p-0">
                {skillCandidates.map((sc, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.accepted ? "bg-emerald-500" : "bg-zinc-300"}`} />
                    <span className="text-xs font-mono flex-1">{sc.skill_name}</span>
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">{sc.confidence != null ? (sc.confidence * 100).toFixed(0) + "%" : ""}</span>
                    {sc.rejection_reason && (
                      <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{sc.rejection_reason}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Decision Trace */}
          {session.decision_trace && (
            <Card>
              <CardHeader><CardTitle>Decision Trace</CardTitle></CardHeader>
              <CardContent className="p-4">
                <p className="text-xs font-mono text-[var(--text-secondary)] break-all leading-relaxed">
                  {session.decision_trace}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Evaluation */}
        <div className="lg:col-span-1 space-y-3">
          <EvalPanel session={session} />

          {/* Reply preview */}
          {session.reply_preview && (
            <Card>
              <CardHeader><CardTitle>返信プレビュー</CardTitle></CardHeader>
              <CardContent className="p-4">
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {session.reply_preview}
                </p>
              </CardContent>
            </Card>
          )}

          {/* answer_candidate_json raw */}
          <Card>
            <CardHeader><CardTitle>answer_candidate_json</CardTitle></CardHeader>
            <CardContent className="p-4">
              <pre className="text-[10px] text-[var(--text-muted)] overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
                {acj ? JSON.stringify(acj, null, 2) : "null"}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
