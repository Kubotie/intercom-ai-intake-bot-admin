"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { FlaskConical, Send, ChevronDown, Zap, BookOpen, ExternalLink, MessageSquare, Search, PlayCircle, AlertTriangle, CheckCircle2, AlertCircle, Info, Pencil, Copy, Database, ArrowRight, RefreshCw } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SandboxMode = "full" | "classify" | "multi";

// Multi-turn 会話シミュレーター用型
type ConvTurn = {
  turn: number;
  userMessage: string;
  botReply: string | null;
  botResult: SandboxResult | null;
  isUserAi: boolean;       // turn1=false（手入力）, turn2以降=true（LLM生成）
  isTerminal: boolean;
  terminalReason?: string;
};

type AnalysisIssue = {
  severity: "error" | "warning" | "info";
  area: "intent" | "slot" | "skill" | "handoff" | "reply" | "workflow";
  description: string;
  recommendation: string;
};

type ConversationAnalysis = {
  outcome: string;
  total_turns: number;
  score: number;
  summary: string;
  issues: AnalysisIssue[];
};

type ImprovementActionItem = {
  type: "add_faq" | "update_knowledge" | "adjust_workflow" | "add_skill" | "other";
  priority: "high" | "medium" | "low";
  title: string;
  content: string;
  target: string;
};

type ImprovementSuggestion = {
  problem: string;
  root_cause: string;
  actions: ImprovementActionItem[];
};

type TurnCorrection = {
  expectedAnswer: string;
  isExpanded: boolean;
  isGenerating: boolean;
  suggestion: ImprovementSuggestion | null;
};

type LogConversation = {
  id: string | number;
  title: string;
  sent_at: string;
  message_count: number | string;
  user_messages: { order: number; timestamp: string; email: string; body: string }[];
};

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

  // ── Multi-turn 会話シミュレーター state ──────────────────────────────
  const [scenarioContext,  setScenarioContext]  = useState("");
  const [initialMessage,   setInitialMessage]   = useState("");
  const [maxTurns,         setMaxTurns]         = useState(6);
  const [multiConcierge,   setMultiConcierge]   = useState("");
  const [convHistory,      setConvHistory]      = useState<ConvTurn[]>([]);
  const [convPhase,        setConvPhase]        = useState<"idle" | "running" | "analyzing" | "done">("idle");
  const [convAnalysis,     setConvAnalysis]     = useState<ConversationAnalysis | null>(null);
  const [convStatusMsg,    setConvStatusMsg]    = useState("");
  // log参照ロード
  const [logConversations, setLogConversations] = useState<LogConversation[]>([]);
  const [logSearch,        setLogSearch]        = useState("");
  const [logLoading,       setLogLoading]       = useState(false);
  const [showLogList,      setShowLogList]      = useState(false);
  const [corrections,      setCorrections]      = useState<Record<number, TurnCorrection>>({});
  const [faqAddStatus,     setFaqAddStatus]     = useState<Record<string, { status: "idle" | "loading" | "done" | "error"; message?: string }>>({});
  const chatBottomRef = useRef<HTMLDivElement>(null);

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

  // ── Multi-turn: log-intercom からシナリオ参照ロード ──────────────────
  const loadLogConversations = async () => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (logSearch.trim()) params.set("search", logSearch.trim());
      const res = await fetch(`/api/sandbox/log-conversations?${params}`);
      const data = await res.json();
      setLogConversations(data.conversations ?? []);
    } catch {
      setLogConversations([]);
    } finally {
      setLogLoading(false);
    }
  };

  const applyLogAsScenario = (conv: LogConversation) => {
    // 実会話の最初のメッセージを初期発話として使用、full bodyをシナリオコンテキストに
    const firstMsg = conv.user_messages[0]?.body ?? "";
    setInitialMessage(firstMsg);
    setScenarioContext(conv.title + "\n" + conv.user_messages.map(m => m.body).join("\n"));
    setShowLogList(false);
  };

  // ── 会話シミュレーションのメインループ ────────────────────────────────
  const runConversation = async () => {
    if (!initialMessage.trim()) return;
    setConvPhase("running");
    setConvHistory([]);
    setConvAnalysis(null);

    const convId = `sim_${Date.now()}`;
    let prevCategory: string | null = null;
    let prevSlots: Record<string, unknown> = {};
    const history: ConvTurn[] = [];
    let currentUserMessage = initialMessage.trim();
    let outcome = "timeout";

    for (let turn = 1; turn <= maxTurns; turn++) {
      setConvStatusMsg(`ターン ${turn}: bot が処理中…`);

      // ① Bot がユーザーメッセージを処理
      let botResult: SandboxResult & { next_turn_state?: { category: string; slots: Record<string, unknown> } };
      try {
        const res = await fetch("/api/sandbox/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: currentUserMessage,
            conversation_id: convId,
            message_order: turn,
            prev_category: prevCategory,
            prev_slots: prevSlots,
            concierge_key: multiConcierge || null,
          }),
        });
        botResult = await res.json();
        if (botResult.next_turn_state) {
          prevCategory = botResult.next_turn_state.category;
          prevSlots    = botResult.next_turn_state.slots;
        }
      } catch (err) {
        const errTurn: ConvTurn = {
          turn, userMessage: currentUserMessage, botReply: null, botResult: null,
          isUserAi: turn > 1, isTerminal: true, terminalReason: "エラー: " + String(err),
        };
        history.push(errTurn);
        setConvHistory([...history]);
        outcome = "error";
        break;
      }

      // ② 終了判定
      const isEscalation = botResult.should_escalate;
      const isHandoff    = botResult.status === "ready_for_handoff" && botResult.reply_source !== "next_message";
      const isResolved   = botResult.reply_source === "faq_answer" || botResult.reply_source === "help_center_answer";
      const isTerminal   = isEscalation || isHandoff || isResolved || turn === maxTurns;

      if (isEscalation) outcome = "escalation";
      else if (isHandoff) outcome = "handoff";
      else if (isResolved) outcome = "resolved";

      const newTurn: ConvTurn = {
        turn,
        userMessage: currentUserMessage,
        botReply: botResult.reply_candidate,
        botResult,
        isUserAi: turn > 1,
        isTerminal,
        terminalReason: isEscalation ? "エスカレーション" : isHandoff ? "担当者引き継ぎ" : isResolved ? "スキル回答（解決）" : turn === maxTurns ? "最大ターン到達" : undefined,
      };
      history.push(newTurn);
      setConvHistory([...history]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

      if (isTerminal) break;

      // ③ ユーザーAIが次の発話を生成
      setConvStatusMsg(`ターン ${turn + 1}: ユーザーAI が返答を生成中…`);
      try {
        const res = await fetch("/api/sandbox/generate-user-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bot_reply: botResult.reply_candidate,
            scenario_context: scenarioContext,
            category: botResult.category,
            status: botResult.status,
            history: history.map(h => ({ role: "user", message: h.userMessage }))
              .flatMap((u, i) => history[i].botReply ? [u, { role: "bot", message: history[i].botReply! }] : [u]),
          }),
        });
        const data = await res.json();
        currentUserMessage = data.next_user_message ?? "（ユーザーAI生成失敗）";
      } catch {
        currentUserMessage = "（ユーザーAI生成失敗）";
      }
    }

    // ④ 会話分析
    setConvPhase("analyzing");
    setConvStatusMsg("会話を分析中…");
    try {
      const turnData = history.map(h => ({
        turn:          h.turn,
        user_message:  h.userMessage,
        bot_reply:     h.botReply,
        category:      h.botResult?.category ?? "",
        status:        h.botResult?.status   ?? "",
        slots_filled:  h.botResult?.slots_filled_count ?? 0,
        slots_total:   h.botResult?.slots.length ?? 0,
        reply_source:  h.botResult?.reply_source ?? "",
        should_escalate: h.botResult?.should_escalate ?? false,
        decision_trace: h.botResult?.decision_trace ?? "",
      }));
      const res = await fetch("/api/sandbox/analyze-conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: turnData, scenario_context: scenarioContext, outcome }),
      });
      const analysis: ConversationAnalysis = await res.json();
      setConvAnalysis(analysis);
    } catch {
      setConvAnalysis({ outcome, total_turns: history.length, score: 0, summary: "分析に失敗しました", issues: [] });
    }

    setConvPhase("done");
    setConvStatusMsg("");
    setCorrections({});
  };

  const toggleCorrectionExpand = (turnNum: number) => {
    setCorrections(prev => ({
      ...prev,
      [turnNum]: {
        expectedAnswer: prev[turnNum]?.expectedAnswer ?? "",
        isExpanded: !prev[turnNum]?.isExpanded,
        isGenerating: prev[turnNum]?.isGenerating ?? false,
        suggestion: prev[turnNum]?.suggestion ?? null,
      },
    }));
  };

  const updateExpectedAnswer = (turnNum: number, value: string) => {
    setCorrections(prev => ({
      ...prev,
      [turnNum]: { ...prev[turnNum], expectedAnswer: value },
    }));
  };

  const generateImprovement = async (turn: ConvTurn) => {
    const correction = corrections[turn.turn];
    if (!correction?.expectedAnswer?.trim()) return;
    setCorrections(prev => ({
      ...prev,
      [turn.turn]: { ...prev[turn.turn], isGenerating: true },
    }));
    try {
      const res = await fetch("/api/sandbox/suggest-improvement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message:     turn.userMessage,
          bot_reply:        turn.botReply ?? "",
          expected_reply:   correction.expectedAnswer,
          category:         turn.botResult?.category     ?? "",
          decision_trace:   turn.botResult?.decision_trace ?? "",
          reply_source:     turn.botResult?.reply_source   ?? "",
          scenario_context: scenarioContext,
        }),
      });
      const suggestion: ImprovementSuggestion = await res.json();
      setCorrections(prev => ({
        ...prev,
        [turn.turn]: { ...prev[turn.turn], isGenerating: false, suggestion },
      }));
    } catch {
      setCorrections(prev => ({
        ...prev,
        [turn.turn]: { ...prev[turn.turn], isGenerating: false },
      }));
    }
  };

  const addFaqToKnowledge = async (key: string, action: ImprovementActionItem) => {
    setFaqAddStatus(prev => ({ ...prev, [key]: { status: "loading" } }));
    try {
      const res = await fetch("/api/knowledge/add-faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: action.title, content: action.content }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "追加失敗");
      const stats = data.sync_stats;
      const msg = stats
        ? `完了 — 新規 ${stats.created ?? 0} 件 / 更新 ${stats.updated ?? 0} 件`
        : data.sync_error ? `Notion 追加済み（同期エラー: ${data.sync_error}）` : "完了";
      setFaqAddStatus(prev => ({ ...prev, [key]: { status: "done", message: msg } }));
    } catch (err: unknown) {
      setFaqAddStatus(prev => ({ ...prev, [key]: { status: "error", message: (err as Error).message } }));
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
        <button
          onClick={() => { setMode("multi"); setClassifyResult(null); setFullResult(null); setError(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === "multi"
              ? "bg-white text-zinc-800 shadow-sm"
              : "text-zinc-500 hover:text-zinc-700"
          }`}
        >
          <MessageSquare size={12} /> Multi-turn
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Input Panel ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                {mode === "classify" ? "Intent 分類テスト" : mode === "full" ? "Full Simulation" : "Multi-turn シミュレーション"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Description */}
              <p className="text-xs text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                {mode === "classify"
                  ? "LLM に分類させてカテゴリ・confidence・理由を返します。スロット収集・Skill 実行は行いません。"
                  : mode === "full"
                  ? "分類 → スロット → Skill → 返信候補まで全工程をシミュレートします。NocoDB / Intercom への書き込みは行いません。"
                  : "log_intercom の実会話を読み込み、複数ターンを連続シミュレーションします。カテゴリ・スロットが引き継がれます。"}
              </p>

              {/* ── Single-turn input (classify / full) ── */}
              {mode !== "multi" && (
                <>
                  {/* Presets */}
                  <div>
                    <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">プリセット</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESETS.map(p => (
                        <button key={p.label} onClick={() => setMessage(p.message)}
                          className="text-[11px] px-2 py-1 rounded border border-[var(--border)] bg-zinc-50 hover:bg-zinc-100 text-zinc-600 transition-colors"
                          title={p.message}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                      ユーザー発話 <span className="text-red-500">*</span>
                    </label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
                      rows={4} placeholder="例: ポップアップが表示されません"
                      className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
                  </div>
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
                </>
              )}

              {/* ── Multi-turn: 会話シミュレーター入力 ── */}
              {mode === "multi" && (
                <div className="space-y-3">
                  {/* log参照ロード */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">実会話から参照</p>
                      <button onClick={() => setShowLogList(v => !v)}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                        <Search size={10} /> log_intercom から参照
                      </button>
                    </div>
                    {showLogList && (
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <input value={logSearch} onChange={e => setLogSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") loadLogConversations(); }}
                            placeholder="キーワード検索"
                            className="flex-1 h-7 px-2 rounded border border-[var(--border)] bg-zinc-50 text-xs outline-none" />
                          <button onClick={loadLogConversations} disabled={logLoading}
                            className="px-2 h-7 rounded border border-[var(--border)] bg-white text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40">
                            {logLoading ? "…" : "検索"}
                          </button>
                        </div>
                        {logConversations.length > 0 && (
                          <div className="max-h-36 overflow-y-auto space-y-0.5 border border-[var(--border)] rounded p-1">
                            {logConversations.map((conv) => (
                              <button key={String(conv.id)} onClick={() => applyLogAsScenario(conv)}
                                className="w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-zinc-100 text-zinc-700 transition-colors">
                                <div className="font-medium truncate">{conv.title}</div>
                                <div className="text-[10px] text-zinc-400 mt-0.5">
                                  {String(conv.sent_at).slice(0, 10)} · {conv.user_messages.length}発話
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* シナリオ背景 */}
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                      ユーザーの状況・背景
                      <span className="text-[10px] font-normal ml-1 text-zinc-400">（ユーザーAIへのヒント）</span>
                    </label>
                    <textarea value={scenarioContext} onChange={e => setScenarioContext(e.target.value)}
                      rows={3} placeholder="例: ポップアップ「春季セール」を設定したがPCのChromeで表示されない。体験は公開済み。"
                      className="w-full text-xs px-2.5 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
                  </div>

                  {/* 最初のメッセージ */}
                  <div>
                    <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">
                      最初のユーザーメッセージ <span className="text-red-500">*</span>
                    </label>
                    <textarea value={initialMessage} onChange={e => setInitialMessage(e.target.value)}
                      rows={2} placeholder="例: ポップアップが表示されません"
                      className="w-full text-sm px-2.5 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
                  </div>

                  {/* 設定 */}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">最大ターン数</label>
                      <select value={maxTurns} onChange={e => setMaxTurns(Number(e.target.value))}
                        className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs outline-none appearance-none">
                        {[3,4,5,6,8,10].map(n => <option key={n} value={n}>{n} ターン</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">Concierge</label>
                      <div className="relative">
                        <select value={multiConcierge} onChange={e => setMultiConcierge(e.target.value)}
                          className="w-full h-8 pl-2 pr-7 rounded border border-[var(--border)] bg-white text-xs outline-none appearance-none">
                          <option value="">デフォルト</option>
                          {concierges.map(c => (
                            <option key={c.concierge_key} value={c.concierge_key}>{c.display_name}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-2 text-[var(--text-muted)] pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <Button size="md"
                    onClick={() => { setConvHistory([]); setConvAnalysis(null); runConversation(); }}
                    disabled={!initialMessage.trim() || convPhase === "running" || convPhase === "analyzing"}
                    className="w-full">
                    <PlayCircle size={13} />
                    {convPhase === "running" ? "会話シミュレーション中…"
                    : convPhase === "analyzing" ? "会話を分析中…"
                    : "会話シミュレーション開始"}
                  </Button>
                </div>
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

          {!classifyResult && !fullResult && !loading && convHistory.length === 0 && convPhase === "idle" && (
            <Card>
              <CardContent className="p-10 text-center">
                <FlaskConical size={32} className="mx-auto text-zinc-200 mb-3" />
                <p className="text-sm text-[var(--text-muted)]">
                  {mode === "classify" ? "発話を入力して Intent 分類を実行してください"
                  : mode === "multi"   ? "シナリオを設定して会話シミュレーションを開始してください"
                  : "発話を入力して Full Simulation を実行してください"}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">Intercom 返信・session 書き込みは行いません</p>
              </CardContent>
            </Card>
          )}

          {/* ── Multi-turn: チャット表示 ── */}
          {mode === "multi" && (convHistory.length > 0 || convPhase === "running" || convPhase === "analyzing") && (
            <div className="space-y-3">
              {/* チャットバブル */}
              <Card>
                <CardContent className="p-4 space-y-4 max-h-[520px] overflow-y-auto">
                  {convHistory.map((turn) => (
                    <div key={turn.turn} className="space-y-2">
                      {/* ユーザー発話（右寄せ） */}
                      <div className="flex justify-end gap-2">
                        <div className="max-w-[80%] space-y-0.5">
                          <div className="flex items-center justify-end gap-1.5 mb-0.5">
                            {turn.isUserAi && (
                              <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">
                                AI生成
                              </span>
                            )}
                            <span className="text-[10px] text-zinc-400">ユーザー · Turn {turn.turn}</span>
                          </div>
                          <div className="bg-blue-500 text-white text-xs px-3 py-2 rounded-2xl rounded-tr-sm leading-relaxed whitespace-pre-wrap">
                            {turn.userMessage}
                          </div>
                        </div>
                      </div>

                      {/* Bot 返答（左寄せ） */}
                      {turn.botResult && (
                        <div className="flex gap-2">
                          <div className="max-w-[85%] space-y-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] text-zinc-400">Bot</span>
                              {categoryBadge(turn.botResult.category)}
                              <StatusPill value={turn.botResult.should_escalate ? "escalate" : turn.botResult.status} />
                              <span className="text-[10px] text-zinc-400 font-mono">{turn.botResult.reply_source}</span>
                            </div>
                            <div className="bg-zinc-100 text-zinc-800 text-xs px-3 py-2 rounded-2xl rounded-tl-sm leading-relaxed whitespace-pre-wrap">
                              {turn.botReply ?? <span className="text-zinc-400 italic">（返信なし）</span>}
                            </div>
                            {/* スロット進捗 */}
                            {turn.botResult.slots.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <span className="text-[10px] text-zinc-400">slots:</span>
                                {turn.botResult.slots.map(s => (
                                  <span key={s.slot_name}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border ${s.is_collected ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-zinc-50 border-zinc-200 text-zinc-400"}`}>
                                    {s.label}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Decision trace */}
                            <p className="text-[9px] font-mono text-zinc-400 mt-0.5 truncate" title={turn.botResult.decision_trace}>
                              {turn.botResult.decision_trace}
                            </p>

                            {/* ── 回答修正フィードバック ── */}
                            <div className="mt-2">
                              <button
                                onClick={() => toggleCorrectionExpand(turn.turn)}
                                className="flex items-center gap-1 text-[10px] text-zinc-400 hover:text-amber-600 transition-colors"
                              >
                                <Pencil size={10} />
                                {corrections[turn.turn]?.isExpanded ? "フィードバックを閉じる" : "回答を改善したい場合"}
                              </button>

                              {corrections[turn.turn]?.isExpanded && (
                                <div className="mt-2 space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                  <div>
                                    <p className="text-[10px] font-semibold text-amber-800 mb-0.5">① 何が問題だったかを書く</p>
                                    <p className="text-[10px] text-amber-700 leading-relaxed">
                                      本来どう答えるべきだったか、何が足りなかったかを説明してください。
                                      「改善アクションを生成」で Knowledge / Workflow への具体的な修正案が出ます。
                                    </p>
                                  </div>
                                  <textarea
                                    value={corrections[turn.turn]?.expectedAnswer ?? ""}
                                    onChange={e => updateExpectedAnswer(turn.turn, e.target.value)}
                                    rows={4}
                                    placeholder={"例:\n・プラン提案は不要で、URLを確認してから技術調査に進むべきだった\n・「ボットアクセスのPV除外は標準機能にない」という正確な回答をすべきだった"}
                                    className="w-full text-xs px-2.5 py-2 rounded border border-amber-200 bg-white resize-none outline-none focus:ring-1 focus:ring-amber-300 leading-relaxed"
                                  />
                                  <button
                                    onClick={() => generateImprovement(turn)}
                                    disabled={!corrections[turn.turn]?.expectedAnswer?.trim() || corrections[turn.turn]?.isGenerating}
                                    className="w-full text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 font-medium transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    {corrections[turn.turn]?.isGenerating
                                      ? <><div className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" /> 分析中…</>
                                      : <><Zap size={11} /> ② 改善アクションを生成</>}
                                  </button>

                                  {corrections[turn.turn]?.suggestion && (() => {
                                    const s = corrections[turn.turn].suggestion!;
                                    const hasFaqAction             = s.actions.some(a => a.type === "add_faq");
                                    const hasUpdateKnowledgeAction = s.actions.some(a => a.type === "update_knowledge");
                                    const hasPolicyAction          = s.actions.some(a => a.type === "adjust_workflow");
                                    const hasSkillAction           = s.actions.some(a => a.type === "add_skill");
                                    const hasKnowledgeAction       = hasFaqAction || hasUpdateKnowledgeAction;
                                    return (
                                      <div className="space-y-2 pt-1 border-t border-amber-200">
                                        {/* 問題と根本原因 */}
                                        <div className="space-y-0.5">
                                          <p className="text-[10px] font-semibold text-amber-800">特定された問題</p>
                                          <p className="text-xs text-zinc-700 leading-relaxed">{s.problem}</p>
                                          <span className="inline-block text-[9px] font-mono bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                                            root_cause: {s.root_cause}
                                          </span>
                                        </div>

                                        {/* 改善アクション */}
                                        {s.actions.length > 0 && (
                                          <div className="space-y-2">
                                            <p className="text-[10px] font-semibold text-amber-800">改善アクション ({s.actions.length}件)</p>
                                            {s.actions.map((action, i) => {
                                              const faqKey = `${turn.turn}-${i}`;
                                              const faqSt  = faqAddStatus[faqKey];
                                              return (
                                              <div key={i} className="bg-white border border-amber-100 rounded-lg p-3 space-y-1.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                    action.priority === "high"   ? "bg-red-100 text-red-700"
                                                    : action.priority === "medium" ? "bg-amber-100 text-amber-700"
                                                    : "bg-zinc-100 text-zinc-600"
                                                  }`}>{action.priority.toUpperCase()}</span>
                                                  <span className="text-[9px] font-mono bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">{action.type}</span>
                                                  <span className="text-xs font-semibold text-zinc-800">{action.title}</span>
                                                </div>
                                                <p className="text-[10px] text-zinc-500">
                                                  <span className="font-medium">反映先:</span> {action.target}
                                                </p>
                                                <div className="relative">
                                                  <pre className="text-[10px] text-zinc-700 bg-zinc-50 rounded p-2 whitespace-pre-wrap border border-zinc-100 font-mono leading-relaxed overflow-x-auto">
                                                    {action.content}
                                                  </pre>
                                                  <button
                                                    onClick={() => navigator.clipboard.writeText(action.content)}
                                                    title="コピー"
                                                    className="absolute top-1.5 right-1.5 p-1 rounded bg-white border border-zinc-200 text-zinc-400 hover:text-zinc-600 hover:border-zinc-300 transition-colors"
                                                  >
                                                    <Copy size={10} />
                                                  </button>
                                                </div>
                                                {action.type === "add_faq" && (
                                                  <div className="pt-1 space-y-1">
                                                    {(!faqSt || faqSt.status === "idle") && (
                                                      <button
                                                        onClick={() => addFaqToKnowledge(faqKey, action)}
                                                        className="w-full flex items-center justify-center gap-1.5 text-[10px] py-1.5 px-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-medium transition-colors"
                                                      >
                                                        <Database size={10} /> 1クリックで FAQ に追加・同期
                                                      </button>
                                                    )}
                                                    {faqSt?.status === "loading" && (
                                                      <p className="text-[10px] text-center text-zinc-500 flex items-center justify-center gap-1">
                                                        <RefreshCw size={9} className="animate-spin" /> Notion に追加中・同期中…
                                                      </p>
                                                    )}
                                                    {faqSt?.status === "done" && (
                                                      <p className="text-[10px] text-emerald-600 flex items-center gap-1 justify-center font-medium">
                                                        <CheckCircle2 size={10} /> {faqSt.message}
                                                      </p>
                                                    )}
                                                    {faqSt?.status === "error" && (
                                                      <p className="text-[10px] text-red-500 flex items-center gap-1 justify-center">
                                                        <AlertTriangle size={9} /> {faqSt.message}
                                                      </p>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                              );
                                            })}
                                          </div>
                                        )}

                                        {/* ③ 次のステップへのナビゲーション */}
                                        <div className="pt-1.5 border-t border-amber-200 space-y-1.5">
                                          <p className="text-[10px] font-semibold text-amber-800">③ 次のステップ — 上の内容を反映する</p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {hasKnowledgeAction && (() => {
                                              const kAction = s.actions.find(a => a.type === "add_faq" || a.type === "update_knowledge");
                                              const p = new URLSearchParams({ from: "sandbox", root_cause: s.root_cause, action_type: kAction?.type ?? "add_faq" });
                                              if (kAction?.content) p.set("action_content", kAction.content.slice(0, 400));
                                              return (
                                                <a
                                                  href={`/knowledge?${p.toString()}`}
                                                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-medium transition-colors">
                                                  <Database size={10} /> Knowledge を更新 <ArrowRight size={9} />
                                                </a>
                                              );
                                            })()}
                                            {hasPolicyAction && (() => {
                                              const pAction = s.actions.find(a => a.type === "adjust_workflow");
                                              const p = new URLSearchParams({ from: "sandbox", root_cause: s.root_cause, action_type: "adjust_workflow" });
                                              if (pAction?.content) p.set("action_content", pAction.content.slice(0, 400));
                                              return (
                                                <a
                                                  href={`/policies?${p.toString()}`}
                                                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-medium transition-colors">
                                                  <BookOpen size={10} /> Policies を修正 <ArrowRight size={9} />
                                                </a>
                                              );
                                            })()}
                                            {hasSkillAction && (() => {
                                              const skillAction = s.actions.find(a => a.type === "add_skill");
                                              const params = new URLSearchParams({ from: "sandbox", root_cause: s.root_cause });
                                              if (skillAction?.title)   params.set("skill_title",   skillAction.title);
                                              if (skillAction?.content) params.set("skill_content", skillAction.content);
                                              return (
                                                <a
                                                  href={`/skills?${params.toString()}`}
                                                  className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-medium transition-colors">
                                                  <Zap size={10} /> Skills を追加・修正 <ArrowRight size={9} />
                                                </a>
                                              );
                                            })()}
                                            {!hasKnowledgeAction && !hasPolicyAction && !hasSkillAction && (
                                              <a
                                                href={`/policies?from=sandbox&root_cause=${encodeURIComponent(s.root_cause)}`}
                                                className="inline-flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 font-medium transition-colors">
                                                <BookOpen size={10} /> Policies を確認 <ArrowRight size={9} />
                                              </a>
                                            )}
                                          </div>
                                          <p className="text-[9px] text-amber-600">反映後、同じシナリオで再シミュレーションして改善を確認してください。</p>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 終了バナー */}
                      {turn.isTerminal && turn.terminalReason && (
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                          turn.terminalReason === "エスカレーション" ? "bg-red-50 border border-red-200 text-red-700"
                          : turn.terminalReason === "担当者引き継ぎ" ? "bg-amber-50 border border-amber-200 text-amber-700"
                          : turn.terminalReason === "スキル回答（解決）" ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                          : "bg-zinc-50 border border-zinc-200 text-zinc-600"
                        }`}>
                          {turn.terminalReason === "エスカレーション" ? <AlertTriangle size={13} />
                          : turn.terminalReason === "担当者引き継ぎ" ? <CheckCircle2 size={13} />
                          : turn.terminalReason === "スキル回答（解決）" ? <CheckCircle2 size={13} />
                          : <Info size={13} />}
                          {turn.terminalReason} — 会話終了
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 実行中インジケーター */}
                  {(convPhase === "running" || convPhase === "analyzing") && (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-500">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin shrink-0" />
                      {convStatusMsg}
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </CardContent>
              </Card>

              {/* 分析パネル */}
              {convPhase === "analyzing" && (
                <Card>
                  <CardContent className="p-4 flex items-center gap-2 text-xs text-zinc-500">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin shrink-0" />
                    会話品質を分析中…
                  </CardContent>
                </Card>
              )}

              {convAnalysis && convPhase === "done" && (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    {/* スコア + サマリー */}
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 text-center">
                        <div className={`text-3xl font-bold tabular-nums ${
                          convAnalysis.score >= 80 ? "text-emerald-600"
                          : convAnalysis.score >= 60 ? "text-amber-600"
                          : "text-red-500"
                        }`}>
                          {convAnalysis.score}
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">/ 100</div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">会話品質分析</p>
                          <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200">
                            {convAnalysis.outcome} · {convAnalysis.total_turns}ターン
                          </span>
                        </div>
                        <ConfidenceBar value={convAnalysis.score / 100} />
                        <p className="text-xs text-zinc-700 leading-relaxed">{convAnalysis.summary}</p>
                      </div>
                    </div>

                    {/* Issues */}
                    {convAnalysis.issues.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                          改善提案 ({convAnalysis.issues.length})
                        </p>
                        {convAnalysis.issues.map((issue, i) => (
                          <div key={i} className={`rounded-lg border p-3 space-y-1.5 ${
                            issue.severity === "error"   ? "bg-red-50 border-red-200"
                            : issue.severity === "warning" ? "bg-amber-50 border-amber-200"
                            : "bg-zinc-50 border-zinc-200"
                          }`}>
                            <div className="flex items-center gap-2">
                              {issue.severity === "error"   ? <AlertTriangle size={12} className="text-red-600 shrink-0" />
                              : issue.severity === "warning" ? <AlertCircle  size={12} className="text-amber-600 shrink-0" />
                              : <Info size={12} className="text-zinc-500 shrink-0" />}
                              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                issue.severity === "error"   ? "bg-red-100 text-red-700"
                                : issue.severity === "warning" ? "bg-amber-100 text-amber-700"
                                : "bg-zinc-100 text-zinc-600"
                              }`}>
                                {issue.severity}
                              </span>
                              <span className="text-[10px] font-mono bg-white text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200">
                                {issue.area}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-800 font-medium">{issue.description}</p>
                            <p className="text-xs text-zinc-600 leading-relaxed">
                              <span className="font-medium text-zinc-500">推奨: </span>{issue.recommendation}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {convAnalysis.issues.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <CheckCircle2 size={13} />
                        問題点は検出されませんでした
                      </div>
                    )}

                    {/* 次のステップ */}
                    <div className="pt-3 border-t border-[var(--border-subtle)]">
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">次のステップ</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => { setConvHistory([]); setConvAnalysis(null); runConversation(); }}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 font-medium transition-colors"
                        >
                          <RefreshCw size={11} /> 同じシナリオで再実行
                        </button>
                        <button
                          onClick={() => { setConvHistory([]); setConvAnalysis(null); setInitialMessage(""); setScenarioContext(""); setConvPhase("idle"); }}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-700 font-medium transition-colors"
                        >
                          <PlayCircle size={11} /> 新しいシナリオを試す
                        </button>
                        {convAnalysis.issues.some(i => i.area === "reply" || i.area === "skill") && (
                          <a href="/knowledge" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium transition-colors">
                            <Database size={11} /> Knowledge を更新 <ArrowRight size={10} />
                          </a>
                        )}
                        {convAnalysis.issues.some(i => i.area === "workflow" || i.area === "handoff") && (
                          <a href="/workflows" className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-medium transition-colors">
                            <ExternalLink size={11} /> Workflows を確認 <ArrowRight size={10} />
                          </a>
                        )}
                      </div>
                      {convAnalysis.issues.length > 0 && (
                        <p className="text-[10px] text-zinc-400 mt-2">
                          各ターンの「回答を改善したい場合」からフィードバックを入力すると、具体的な修正案が生成されます。
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
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
