"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { FlaskConical, Send, ChevronDown } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Slot = {
  slot_name: string;
  slot_value: string | null;
  is_collected: boolean;
  is_required: boolean;
  confidence: number | null;
  label: string;
};

type SkillCandidate = {
  skill_name: string;
  accepted: boolean;
  confidence: number;
  rejection_reason: string | null;
};

type SandboxResult = {
  category: string;
  category_forced: boolean;
  confidence: number;
  classify_reason: string | null;
  should_escalate: boolean;
  escalation_keywords: string[];
  status: string;
  slots: Slot[];
  slots_filled_count: number;
  slots_missing_count: number;
  selected_skill: string | null;
  reply_source: string;
  reply_candidate: string | null;
  answer_candidate_json: {
    answer_type?: string;
    answer_message?: string;
    confidence?: number;
    retrieval_query?: string;
    candidate_titles?: string[];
    candidate_chunk_ids?: string[];
    skill_candidates?: SkillCandidate[];
    next_message?: string;
    ask_slots?: string[];
    should_escalate?: boolean;
  };
  concierge: {
    key: string;
    name: string;
    intercom_admin_id: string | null;
    source: string;
  } | null;
  decision_trace: string;
  error?: string;
};

type Concierge = { concierge_key: string; display_name: string };

const CATEGORY_OPTIONS = [
  { value: "", label: "自動判定" },
  { value: "experience_issue",  label: "体験・表示問題" },
  { value: "usage_guidance",    label: "使い方案内" },
  { value: "bug_report",        label: "バグ報告" },
  { value: "tracking_issue",    label: "計測問題" },
  { value: "billing_contract",  label: "請求・契約" },
  { value: "login_account",     label: "ログイン" },
  { value: "report_difference", label: "数値差異" },
];

const TABS = ["Summary", "Routing", "Knowledge", "Reply", "Raw JSON"] as const;
type Tab = typeof TABS[number];

// ─── Sub-components ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-[var(--border-subtle)] last:border-0">
      <span className="text-xs text-[var(--text-muted)] w-32 shrink-0 pt-0.5">{label}</span>
      <div className="text-xs flex-1">{children}</div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const color =
    value === "collecting"       ? "bg-blue-50 text-blue-700 border-blue-200"
    : value === "ready_for_handoff" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-zinc-50 text-zinc-600 border-zinc-200";
  return <span className={`px-2 py-0.5 rounded border text-xs ${color}`}>{value}</span>;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [message,       setMessage]       = useState("");
  const [forceCategory, setForceCategory] = useState("");
  const [conciergeKey,  setConciergeKey]  = useState("");
  const [concierges,    setConcierges]    = useState<Concierge[]>([]);
  const [result,        setResult]        = useState<SandboxResult | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [activeTab,     setActiveTab]     = useState<Tab>("Summary");
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/concierges")
      .then(r => r.json())
      .then(d => setConcierges(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          force_category: forceCategory || null,
          concierge_key:  conciergeKey  || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data as SandboxResult);
      setActiveTab("Summary");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const acj = result?.answer_candidate_json ?? {};

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <FlaskConical size={18} className="text-[var(--text-muted)]" />
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Sandbox</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            発話テスト — 本番会話・Intercom 返信なし
          </p>
        </div>
        <span className="ml-auto text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">
          副作用なし
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Input Panel ──────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>入力</CardTitle></CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                  ユーザー発話 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
                  rows={5}
                  placeholder="例: ポップアップが表示されません"
                  className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                  Intent 強制指定（任意）
                </label>
                <div className="relative">
                  <select
                    value={forceCategory}
                    onChange={e => setForceCategory(e.target.value)}
                    className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs text-[var(--text-primary)] outline-none appearance-none"
                  >
                    {CATEGORY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-2 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                  Concierge 指定（任意）
                </label>
                <div className="relative">
                  <select
                    value={conciergeKey}
                    onChange={e => setConciergeKey(e.target.value)}
                    className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs text-[var(--text-primary)] outline-none appearance-none"
                  >
                    <option value="">Main Concierge（デフォルト）</option>
                    {concierges.map(c => (
                      <option key={c.concierge_key} value={c.concierge_key}>
                        {c.display_name} ({c.concierge_key})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-2 text-[var(--text-muted)] pointer-events-none" />
                </div>
              </div>

              <Button
                size="md"
                onClick={run}
                disabled={!message.trim() || loading}
                className="w-full"
              >
                <Send size={13} />
                {loading ? "実行中…" : "実行 (⌘Enter)"}
              </Button>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Result Panel ─────────────────────────────────── */}
        <div className="lg:col-span-3">
          {/* Loading skeleton */}
          {loading && (
            <Card>
              <CardContent className="p-6 space-y-3">
                {[90, 70, 50, 60, 40].map((w, i) => (
                  <div key={i} className="h-3.5 bg-zinc-100 rounded animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!result && !loading && (
            <Card>
              <CardContent className="p-10 text-center">
                <FlaskConical size={32} className="mx-auto text-zinc-200 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">発話を入力して実行してください</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Intercom 返信・session 書き込みは行いません
                </p>
              </CardContent>
            </Card>
          )}

          {/* Result */}
          {result && !loading && (
            <Card>
              {/* Tab bar */}
              <div className="flex border-b border-[var(--border)] px-4 pt-3 gap-1">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                      activeTab === tab
                        ? "text-[var(--text-primary)] border-b-2 border-zinc-800 -mb-px"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <CardContent className="p-4">
                {/* ── Summary tab ── */}
                {activeTab === "Summary" && (
                  <div>
                    <Row label="Intent">
                      <div className="flex items-center gap-2">
                        {categoryBadge(result.category)}
                        {result.category_forced && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 rounded">forced</span>
                        )}
                        {result.confidence > 0 && (
                          <span className="text-[var(--text-muted)] tabular-nums">
                            {(result.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </Row>
                    <Row label="Status"><StatusPill value={result.status} /></Row>
                    <Row label="Reply Source">{replySourceBadge(result.reply_source)}</Row>
                    <Row label="Escalation">
                      <span className={result.should_escalate ? "text-red-600 font-medium" : "text-[var(--text-muted)]"}>
                        {result.should_escalate
                          ? `⚠ ${result.escalation_keywords.join(", ")}`
                          : "なし"}
                      </span>
                    </Row>
                    {result.concierge && (
                      <Row label="Concierge">
                        <span className="font-medium">{result.concierge.name}</span>
                        <span className="text-[var(--text-muted)] ml-1.5 font-mono text-[10px]">
                          {result.concierge.key}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1.5">
                          ({result.concierge.source})
                        </span>
                      </Row>
                    )}
                    {result.classify_reason && (
                      <Row label="Classify Reason">
                        <span className="text-[var(--text-muted)] font-mono text-[10px]">{result.classify_reason}</span>
                      </Row>
                    )}
                    <Row label="Decision Trace">
                      <span className="font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed">
                        {result.decision_trace}
                      </span>
                    </Row>
                  </div>
                )}

                {/* ── Routing tab ── */}
                {activeTab === "Routing" && (
                  <div>
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                        Slots ({result.slots_filled_count} / {result.slots.length} 収集済み)
                      </p>
                      {result.slots.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)]">スロットなし</p>
                      )}
                      <div className="space-y-1">
                        {result.slots.map(s => (
                          <div key={s.slot_name} className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${s.is_collected ? "bg-emerald-500" : "bg-zinc-200"}`} />
                            <span className="w-40 text-[var(--text-secondary)] shrink-0">{s.label}</span>
                            <span className={`flex-1 ${s.is_collected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] italic"}`}>
                              {s.is_collected ? String(s.slot_value) : "未収集"}
                            </span>
                            {s.confidence != null && (
                              <span className="text-[10px] text-[var(--text-muted)] tabular-nums">
                                {(s.confidence * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    {result.selected_skill && (
                      <Row label="Selected Skill">
                        <span className="font-mono">{result.selected_skill}</span>
                      </Row>
                    )}
                    {acj.ask_slots && acj.ask_slots.length > 0 && (
                      <Row label="Ask Slots">
                        <span className="font-mono text-[10px]">{acj.ask_slots.join(", ")}</span>
                      </Row>
                    )}
                  </div>
                )}

                {/* ── Knowledge tab ── */}
                {activeTab === "Knowledge" && (
                  <div className="space-y-4">
                    {acj.retrieval_query && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                          Retrieval Query
                        </p>
                        <p className="text-xs font-mono bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] break-all">
                          {acj.retrieval_query}
                        </p>
                      </div>
                    )}

                    {acj.candidate_titles && acj.candidate_titles.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                          Candidates ({acj.candidate_titles.length})
                        </p>
                        <div className="space-y-1">
                          {acj.candidate_titles.map((t, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="text-[var(--text-muted)] w-5 shrink-0">{i + 1}.</span>
                              <span className="text-[var(--text-secondary)]">{t}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {acj.skill_candidates && acj.skill_candidates.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                          Skill 試行結果
                        </p>
                        <div className="space-y-1.5">
                          {acj.skill_candidates.map((sc, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.accepted ? "bg-emerald-500" : "bg-zinc-300"}`} />
                              <span className="font-mono flex-1">{sc.skill_name}</span>
                              <span className="tabular-nums text-[var(--text-muted)]">
                                {sc.confidence != null ? (sc.confidence * 100).toFixed(0) + "%" : ""}
                              </span>
                              {sc.rejection_reason && (
                                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">
                                  {sc.rejection_reason}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!acj.retrieval_query && !acj.skill_candidates?.length && (
                      <p className="text-xs text-[var(--text-muted)] py-4">
                        このカテゴリでは Knowledge skill は実行されませんでした
                      </p>
                    )}
                  </div>
                )}

                {/* ── Reply tab ── */}
                {activeTab === "Reply" && (
                  <div className="space-y-3">
                    <Row label="Reply Source">{replySourceBadge(result.reply_source)}</Row>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                        Reply Candidate
                      </p>
                      {result.reply_candidate ? (
                        <div className="text-xs bg-zinc-800 text-white rounded-lg px-4 py-3 leading-relaxed whitespace-pre-wrap">
                          {result.reply_candidate}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)] italic">返信なし（handed_off 状態）</p>
                      )}
                    </div>
                    {acj.answer_type && (
                      <Row label="Answer Type">
                        <span className="font-mono text-[10px]">{acj.answer_type}</span>
                      </Row>
                    )}
                  </div>
                )}

                {/* ── Raw JSON tab ── */}
                {activeTab === "Raw JSON" && (
                  <pre className="text-[10px] text-[var(--text-muted)] overflow-auto max-h-[480px] leading-relaxed whitespace-pre-wrap break-all">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
