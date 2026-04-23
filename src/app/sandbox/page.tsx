"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { FlaskConical, Send, ChevronDown, Zap, BookOpen, ExternalLink } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SandboxMode = "full" | "classify";

type ClassifyResult = {
  category: string;
  confidence: number;
  reason: string | null;
  input_message: string;
  executed_at: string;
  prompt_file: string;
  error?: string;
};

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
    skill_candidates?: SkillCandidate[];
    next_message?: string;
    ask_slots?: string[];
  };
  concierge: { key: string; name: string; intercom_admin_id: string | null; source: string } | null;
  decision_trace: string;
  error?: string;
};

type Concierge = { concierge_key: string; display_name: string };

// ─── Static data ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: "使い方",   message: "ヒートマップの見方を知りたいです",    expected: "usage_guidance"    },
  { label: "体験問題", message: "ABテストが反映されません",            expected: "experience_issue"  },
  { label: "計測問題", message: "タグを設置したのに計測されません",    expected: "tracking_issue"    },
  { label: "ログイン", message: "ログインできません",                  expected: "login_account"     },
  { label: "請求",     message: "プランを確認したいです",              expected: "billing_contract"  },
  { label: "数値差異", message: "数値がレポートと違います",            expected: "report_difference" },
] as const;

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

// 誤分類しやすい境界ペア
const BOUNDARY_HINTS: Record<string, { adjacent: string[]; notes: string[] }> = {
  experience_issue: {
    adjacent: ["usage_guidance", "tracking_issue", "bug_report"],
    notes: [
      "「〜の設定方法」→ usage_guidance / 「〜が表示されない・反映されない」→ experience_issue",
      "「体験/ポップアップ」の言及あり → experience_issue / GTM・タグの言及あり → tracking_issue",
      "「体験のデータが取れない」→ experience_issue（体験起因）vs tracking_issue（計測起因）は曖昧",
    ],
  },
  usage_guidance: {
    adjacent: ["experience_issue", "billing_contract"],
    notes: [
      "「使い方・設定方法」→ usage_guidance / 「表示されない・動かない」→ experience_issue",
      "「プランの機能を知りたい」→ usage_guidance / 「プラン変更・解約」→ billing_contract",
    ],
  },
  tracking_issue: {
    adjacent: ["experience_issue", "bug_report"],
    notes: [
      "GTM / タグ / スクリプト / 計測 に言及 → tracking_issue",
      "体験/ポップアップ系の表示不具合 → experience_issue",
      "エラーメッセージ / 操作不能 → bug_report",
    ],
  },
  bug_report: {
    adjacent: ["tracking_issue", "experience_issue"],
    notes: [
      "明確なエラーメッセージ・操作不能 → bug_report",
      "計測数値がおかしい → tracking_issue",
      "体験/ポップアップの表示異常 → experience_issue",
    ],
  },
  billing_contract: {
    adjacent: ["usage_guidance"],
    notes: [
      "解約・返金・プラン変更・違約 → billing_contract（最優先）",
      "「プランの機能を知りたい」→ usage_guidance",
    ],
  },
  login_account: {
    adjacent: [],
    notes: ["ログイン不可・権限エラー・招待 → login_account（2番目優先）"],
  },
  report_difference: {
    adjacent: ["tracking_issue"],
    notes: [
      "GA4・社内集計との数値差異 → report_difference",
      "計測自体がされていない → tracking_issue",
    ],
  },
};

const FULL_TABS = ["Summary", "Routing", "Knowledge", "Reply", "Raw JSON"] as const;
type FullTab = typeof FULL_TABS[number];

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
    value === "collecting"          ? "bg-blue-50 text-blue-700 border-blue-200"
    : value === "ready_for_handoff" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-zinc-50 text-zinc-600 border-zinc-200";
  return <span className={`px-2 py-0.5 rounded border text-xs ${color}`}>{value}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-400";
  const textColor = pct >= 80 ? "text-emerald-700" : pct >= 60 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-9 text-right ${textColor}`}>{pct}%</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SandboxPage() {
  const [mode,          setMode]          = useState<SandboxMode>("classify");
  const [message,       setMessage]       = useState("");
  const [forceCategory, setForceCategory] = useState("");
  const [conciergeKey,  setConciergeKey]  = useState("");
  const [concierges,    setConcierges]    = useState<Concierge[]>([]);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [fullResult,    setFullResult]    = useState<SandboxResult | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [activeTab,     setActiveTab]     = useState<FullTab>("Summary");
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
    setClassifyResult(null);
    setFullResult(null);
    try {
      if (mode === "classify") {
        const res = await fetch("/api/sandbox/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setClassifyResult(data as ClassifyResult);
      } else {
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
        setFullResult(data as SandboxResult);
        setActiveTab("Summary");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const acj = fullResult?.answer_candidate_json ?? {};

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-2">
        <FlaskConical size={18} className="text-[var(--text-muted)]" />
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Sandbox</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">発話テスト — 本番会話・Intercom 返信なし</p>
        </div>
        <span className="ml-auto text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">
          副作用なし
        </span>
      </div>

      {/* Mode toggle */}
      <div className="mb-5 flex gap-1.5 p-1 bg-zinc-100 rounded-lg w-fit">
        <button
          onClick={() => { setMode("classify"); setFullResult(null); setError(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === "classify"
              ? "bg-white text-zinc-800 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <Zap size={12} /> Classifier Only
        </button>
        <button
          onClick={() => { setMode("full"); setClassifyResult(null); setError(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === "full"
              ? "bg-white text-zinc-800 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <FlaskConical size={12} /> Full Simulation
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Input Panel ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {mode === "classify" ? "Intent 分類テスト" : "Full Simulation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Description */}
              <p className="text-xs text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                {mode === "classify"
                  ? "LLM に分類させてカテゴリ・confidence・理由を返します。スロット収集・Skill 実行は行いません。"
                  : "分類 → スロット → Skill → 返信候補まで全工程をシミュレートします。NocoDB / Intercom への書き込みは行いません。"}
              </p>

              {/* Presets */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                  プリセット
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => setMessage(p.message)}
                      className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-zinc-50 hover:bg-zinc-100 text-zinc-600 transition-colors"
                      title={p.message}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message input */}
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                  ユーザー発話 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
                  rows={4}
                  placeholder="例: ポップアップが表示されません"
                  className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>

              {/* Full mode extras */}
              {mode === "full" && (
                <>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">Intent 強制指定（任意）</label>
                    <div className="relative">
                      <select value={forceCategory} onChange={e => setForceCategory(e.target.value)}
                        className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs outline-none appearance-none">
                        {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <ChevronDown size={12} className="absolute right-2 top-2 text-[var(--text-muted)] pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">Concierge 指定（任意）</label>
                    <div className="relative">
                      <select value={conciergeKey} onChange={e => setConciergeKey(e.target.value)}
                        className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs outline-none appearance-none">
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
                </>
              )}

              <Button size="md" onClick={run} disabled={!message.trim() || loading} className="w-full">
                <Send size={13} />
                {loading ? "実行中…" : mode === "classify" ? "分類を実行 (⌘Enter)" : "Full 実行 (⌘Enter)"}
              </Button>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
              )}
            </CardContent>
          </Card>

          {/* Classifier info card */}
          {mode === "classify" && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">参照プロンプト</p>
                <p className="text-[11px] font-mono text-zinc-500 bg-zinc-50 px-2 py-1.5 rounded border border-zinc-100 break-all">
                  ai-support-bot-md/prompts/classifier_prompt.md
                </p>
                <div className="flex gap-2 pt-1">
                  <a href="/policies" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                    <BookOpen size={11} /> Policies
                  </a>
                  <span className="text-zinc-300">·</span>
                  <a href="/intents" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
                    <ExternalLink size={11} /> Intents
                  </a>
                </div>
                <p className="text-[10px] text-zinc-400 pt-1">
                  誤分類を修正する場合は classifier_prompt.md を編集し、Sandbox で再確認後に git push してください。
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Result Panel ─────────────────────────────────── */}
        <div className="lg:col-span-3">
          {loading && (
            <Card>
              <CardContent className="p-6 space-y-3">
                {[90, 70, 50, 60, 40].map((w, i) => (
                  <div key={i} className="h-3.5 bg-zinc-100 rounded animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </CardContent>
            </Card>
          )}

          {!classifyResult && !fullResult && !loading && (
            <Card>
              <CardContent className="p-10 text-center">
                <FlaskConical size={32} className="mx-auto text-zinc-200 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  {mode === "classify" ? "発話を入力して Intent 分類を実行してください" : "発話を入力して Full Simulation を実行してください"}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">Intercom 返信・session 書き込みは行いません</p>
              </CardContent>
            </Card>
          )}

          {/* ── Classifier Only result ── */}
          {mode === "classify" && classifyResult && !loading && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-5 space-y-4">
                  {/* Category + confidence */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">予測 Intent</p>
                      <div className="flex items-center gap-2">
                        {categoryBadge(classifyResult.category)}
                        <span className="text-xs font-mono text-zinc-400">{classifyResult.category}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Confidence</p>
                      <p className={`text-2xl font-bold tabular-nums ${
                        classifyResult.confidence >= 0.8 ? "text-emerald-600"
                        : classifyResult.confidence >= 0.6 ? "text-amber-600"
                        : "text-red-500"
                      }`}>
                        {Math.round(classifyResult.confidence * 100)}%
                      </p>
                    </div>
                  </div>

                  <ConfidenceBar value={classifyResult.confidence} />

                  {/* Reason */}
                  {classifyResult.reason && (
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">分類理由</p>
                      <p className="text-xs text-zinc-700 bg-zinc-50 px-3 py-2 rounded border border-zinc-100 leading-relaxed">
                        {classifyResult.reason}
                      </p>
                    </div>
                  )}

                  {/* Input */}
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">入力</p>
                    <p className="text-xs text-zinc-600 font-mono bg-zinc-50 px-3 py-2 rounded border border-zinc-100 break-all">
                      {classifyResult.input_message}
                    </p>
                  </div>

                  <p className="text-[10px] text-zinc-400 text-right">
                    {new Date(classifyResult.executed_at).toLocaleTimeString("ja-JP")}
                  </p>
                </CardContent>
              </Card>

              {/* Boundary hints */}
              {BOUNDARY_HINTS[classifyResult.category] && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      誤分類しやすい近接 Intent
                    </p>
                    {BOUNDARY_HINTS[classifyResult.category].adjacent.length > 0 && (
                      <div className="flex gap-1.5 mb-3">
                        {BOUNDARY_HINTS[classifyResult.category].adjacent.map(a => (
                          <span key={a} className="text-[11px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded border border-zinc-200 font-mono">
                            {a}
                          </span>
                        ))}
                      </div>
                    )}
                    <ul className="space-y-1.5">
                      {BOUNDARY_HINTS[classifyResult.category].notes.map((note, i) => (
                        <li key={i} className="text-xs text-zinc-600 flex gap-1.5">
                          <span className="text-zinc-300 shrink-0">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-zinc-400 mt-3">
                      誤分類が続く場合は{" "}
                      <a href="/policies" className="text-blue-600 underline">classifier_prompt.md（/policies）</a>
                      {" "}の境界定義を確認・修正してください。
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* All boundary patterns reference */}
              <details className="rounded-lg border border-zinc-100 bg-zinc-50 text-xs overflow-hidden">
                <summary className="px-4 py-2.5 cursor-pointer text-zinc-500 font-medium select-none hover:bg-zinc-100">
                  ▶ 全 Intent 境界パターン一覧
                </summary>
                <div className="px-4 pb-4 pt-2 space-y-3">
                  {(Object.entries(BOUNDARY_HINTS) as [string, typeof BOUNDARY_HINTS[string]][]).map(([cat, hint]) => (
                    <div key={cat}>
                      <p className="font-mono font-semibold text-zinc-600 mb-1">{cat}</p>
                      <ul className="space-y-0.5 ml-3">
                        {hint.notes.map((n, i) => (
                          <li key={i} className="text-zinc-500 flex gap-1.5">
                            <span className="text-zinc-300 shrink-0">•</span>{n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ── Full Simulation result ── */}
          {mode === "full" && fullResult && !loading && (
            <Card>
              <div className="flex border-b border-[var(--border)] px-4 pt-3 gap-1">
                {FULL_TABS.map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                      activeTab === tab
                        ? "text-[var(--text-primary)] border-b-2 border-zinc-800 -mb-px"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}>
                    {tab}
                  </button>
                ))}
              </div>

              <CardContent className="p-4">
                {activeTab === "Summary" && (
                  <div>
                    <Row label="Intent">
                      <div className="flex items-center gap-2">
                        {categoryBadge(fullResult.category)}
                        {fullResult.category_forced && (
                          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 rounded">forced</span>
                        )}
                        {fullResult.confidence > 0 && (
                          <span className="text-[var(--text-muted)] tabular-nums">
                            {(fullResult.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </Row>
                    <Row label="Status"><StatusPill value={fullResult.status} /></Row>
                    <Row label="Reply Source">{replySourceBadge(fullResult.reply_source)}</Row>
                    <Row label="Escalation">
                      <span className={fullResult.should_escalate ? "text-red-600 font-medium" : "text-[var(--text-muted)]"}>
                        {fullResult.should_escalate ? `⚠ ${fullResult.escalation_keywords.join(", ")}` : "なし"}
                      </span>
                    </Row>
                    {fullResult.concierge && (
                      <Row label="Concierge">
                        <span className="font-medium">{fullResult.concierge.name}</span>
                        <span className="text-[var(--text-muted)] ml-1.5 font-mono text-[10px]">{fullResult.concierge.key}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-1.5">({fullResult.concierge.source})</span>
                      </Row>
                    )}
                    {fullResult.classify_reason && (
                      <Row label="Classify Reason">
                        <span className="text-[var(--text-muted)] font-mono text-[10px]">{fullResult.classify_reason}</span>
                      </Row>
                    )}
                    <Row label="Decision Trace">
                      <span className="font-mono text-[10px] text-[var(--text-secondary)] leading-relaxed">{fullResult.decision_trace}</span>
                    </Row>
                  </div>
                )}

                {activeTab === "Routing" && (
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                      Slots ({fullResult.slots_filled_count} / {fullResult.slots.length} 収集済み)
                    </p>
                    {fullResult.slots.length === 0 && <p className="text-xs text-[var(--text-muted)]">スロットなし</p>}
                    <div className="space-y-1 mb-3">
                      {fullResult.slots.map(s => (
                        <div key={s.slot_name} className="flex items-center gap-2 text-xs">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${s.is_collected ? "bg-emerald-500" : "bg-zinc-200"}`} />
                          <span className="w-40 text-[var(--text-secondary)] shrink-0">{s.label}</span>
                          <span className={`flex-1 ${s.is_collected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] italic"}`}>
                            {s.is_collected ? String(s.slot_value) : "未収集"}
                          </span>
                          {s.confidence != null && (
                            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{(s.confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      ))}
                    </div>
                    {fullResult.selected_skill && <Row label="Selected Skill"><span className="font-mono">{fullResult.selected_skill}</span></Row>}
                    {acj.ask_slots && acj.ask_slots.length > 0 && (
                      <Row label="Ask Slots"><span className="font-mono text-[10px]">{acj.ask_slots.join(", ")}</span></Row>
                    )}
                  </div>
                )}

                {activeTab === "Knowledge" && (
                  <div className="space-y-4">
                    {acj.retrieval_query && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Retrieval Query</p>
                        <p className="text-xs font-mono bg-zinc-50 px-3 py-2 rounded border border-[var(--border)] break-all">{acj.retrieval_query}</p>
                      </div>
                    )}
                    {acj.candidate_titles && acj.candidate_titles.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Candidates ({acj.candidate_titles.length})</p>
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
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Skill 試行結果</p>
                        <div className="space-y-1.5">
                          {acj.skill_candidates.map((sc, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sc.accepted ? "bg-emerald-500" : "bg-zinc-300"}`} />
                              <span className="font-mono flex-1">{sc.skill_name}</span>
                              <span className="tabular-nums text-[var(--text-muted)]">
                                {sc.confidence != null ? (sc.confidence * 100).toFixed(0) + "%" : ""}
                              </span>
                              {sc.rejection_reason && (
                                <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{sc.rejection_reason}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!acj.retrieval_query && !acj.skill_candidates?.length && (
                      <p className="text-xs text-[var(--text-muted)] py-4">このカテゴリでは Knowledge skill は実行されませんでした</p>
                    )}
                  </div>
                )}

                {activeTab === "Reply" && (
                  <div className="space-y-3">
                    <Row label="Reply Source">{replySourceBadge(fullResult.reply_source)}</Row>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Reply Candidate</p>
                      {fullResult.reply_candidate ? (
                        <div className="text-xs bg-zinc-800 text-white rounded-lg px-4 py-3 leading-relaxed whitespace-pre-wrap">{fullResult.reply_candidate}</div>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)] italic">返信なし（handed_off 状態）</p>
                      )}
                    </div>
                    {acj.answer_type && <Row label="Answer Type"><span className="font-mono text-[10px]">{acj.answer_type}</span></Row>}
                  </div>
                )}

                {activeTab === "Raw JSON" && (
                  <pre className="text-[10px] text-[var(--text-muted)] overflow-auto max-h-[480px] leading-relaxed whitespace-pre-wrap break-all">
                    {JSON.stringify(fullResult, null, 2)}
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
