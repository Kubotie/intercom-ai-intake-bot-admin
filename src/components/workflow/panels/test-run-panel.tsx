"use client";
import React, { useState } from "react";
import type { Concierge } from "@/lib/nocodb";
import type { WorkflowRunResult } from "@/lib/workflow-run-result";
import { parseSandboxResult } from "@/lib/workflow-run-result";
import { INTENT_META, SKILL_LABELS, SORTED_CATEGORIES } from "@/lib/workflow-types";

interface Props {
  concierges:  Concierge[];
  workflowKey: string | null;
  onResult:    (result: WorkflowRunResult | null) => void;
  onClose:     () => void;
}

export function TestRunPanel({ concierges, workflowKey, onResult, onClose }: Props) {
  const [message,       setMessage]       = useState("");
  const [conciergeKey,  setConciergeKey]  = useState("");
  const [forceCategory, setForceCategory] = useState("");
  const [running,       setRunning]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [result,        setResult]        = useState<WorkflowRunResult | null>(null);

  async function handleRun() {
    if (!message.trim()) return;
    setRunning(true);
    setError(null);

    console.log("[workflow-sandbox] run started", {
      message:       message.trim().slice(0, 80),
      concierge_key: conciergeKey || null,
      workflow_key:  workflowKey || null,
      force_category: forceCategory || null,
    });

    try {
      const res = await fetch("/api/sandbox/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:        message.trim(),
          concierge_key:  conciergeKey || null,
          force_category: forceCategory || null,
          workflow_key:   workflowKey || null,
        }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(raw.error ?? `HTTP ${res.status}`);

      const parsed = parseSandboxResult(raw, message.trim());
      setResult(parsed);
      onResult(parsed);

      console.log("[workflow-sandbox] run finished", {
        workflow_key:   workflowKey || null,
        concierge_key:  parsed.conciergeKey,
        category:       parsed.category,
        selected_skill: parsed.selectedSkill,
        reply_source:   parsed.replySource,
        message:        message.trim().slice(0, 80),
      });
    } catch (e) {
      const msg = String(e);
      setError(msg);
      console.error("[workflow-sandbox] run failed", {
        error:        msg,
        workflow_key: workflowKey || null,
        message:      message.trim().slice(0, 80),
      });
    } finally {
      setRunning(false);
    }
  }

  function handleClear() {
    setResult(null);
    onResult(null);
  }

  return (
    <div className="absolute top-0 right-0 h-full w-[320px] bg-white border-l border-zinc-200 shadow-lg z-20 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
        <h3 className="text-sm font-semibold text-zinc-900">ワークフローテスト</h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      {/* Input section */}
      <div className="p-4 space-y-3 border-b border-zinc-100 shrink-0">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">発話</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="例: ポップアップが表示されない"
            rows={3}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">コンシェルジュ（任意）</label>
          <select
            value={conciergeKey}
            onChange={(e) => setConciergeKey(e.target.value)}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">main を自動選択</option>
            {concierges.map((c) => (
              <option key={c.Id} value={c.concierge_key}>
                {c.display_name} ({c.concierge_key})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">カテゴリ強制（任意）</label>
          <select
            value={forceCategory}
            onChange={(e) => setForceCategory(e.target.value)}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">自動分類</option>
            {SORTED_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {INTENT_META[cat].label} ({cat})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRun}
            disabled={running || !message.trim()}
            className="flex-1 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "実行中…" : "実行 ⌘↵"}
          </button>
          {result && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 rounded border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50"
            >
              クリア
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-500 break-all">{error}</p>}
      </div>

      {/* Result summary */}
      <div className="flex-1 overflow-y-auto">
        {result && <TestResultSummary result={result} />}
        {!result && !running && (
          <p className="text-xs text-zinc-400 p-4 text-center">
            発話を入力して実行すると<br />workflow 上にハイライトされます
          </p>
        )}
      </div>
    </div>
  );
}

function TestResultSummary({ result }: { result: WorkflowRunResult }) {
  return (
    <div className="p-4 space-y-3">
      <SectionHeader label="実行結果" />

      <Row label="コンシェルジュ" value={result.conciergeName ?? "—"} sub={result.conciergeKey ?? undefined} />

      <Row label="カテゴリ">
        {result.category
          ? <span className="text-[11px] font-semibold text-purple-700">{INTENT_META[result.category]?.label ?? result.category}</span>
          : <span className="text-[11px] text-zinc-400">—</span>}
      </Row>

      <Row label="判定">
        <div className="flex flex-wrap gap-1">
          {result.isEscalation && <Badge color="red">エスカレーション</Badge>}
          {result.isHandoff && !result.isEscalation && <Badge color="amber">ハンドオフ</Badge>}
          {!result.isHandoff && !result.isEscalation && <Badge color="green">返答</Badge>}
        </div>
      </Row>

      <Row label="返答ソース">
        <ReplySourceBadge source={result.replySource} />
      </Row>

      {result.selectedSkill && (
        <Row label="採用スキル">
          <span className="text-[11px] font-semibold text-purple-700">
            {SKILL_LABELS[result.selectedSkill] ?? result.selectedSkill}
          </span>
        </Row>
      )}

      {result.triedSkills.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 mb-1.5">スキル試行</p>
          <div className="space-y-1">
            {result.triedSkills.map((s) => (
              <div key={s.skillName} className="flex items-center gap-1.5 text-[10px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.accepted ? "bg-green-500" : "bg-zinc-300"}`} />
                <span className={s.accepted ? "text-green-700 font-semibold" : "text-zinc-500"}>
                  {SKILL_LABELS[s.skillName] ?? s.skillName}
                </span>
                <span className="text-zinc-400">({(s.confidence * 100).toFixed(0)}%)</span>
                {!s.accepted && s.rejectionReason && (
                  <span className="text-zinc-400 truncate">[{s.rejectionReason}]</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {result.executionProfile && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 mb-1">実行プロファイル</p>
          <div className="text-[10px] text-zinc-500 space-y-0.5 font-mono">
            <p>policy: <span className="text-zinc-700">{result.executionProfile.policyKey}</span></p>
            <p>skill:  <span className="text-zinc-700">{result.executionProfile.skillKey}</span></p>
            <p>source: <span className="text-zinc-700">{result.executionProfile.sourceKey}</span></p>
          </div>
        </div>
      )}

      {result.decisionTrace && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 mb-1">Decision Trace</p>
          <p className="text-[10px] text-zinc-600 font-mono break-all bg-zinc-50 p-2 rounded border border-zinc-100 leading-relaxed">
            {result.decisionTrace}
          </p>
        </div>
      )}

      {result.replyCandidate && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 mb-1">返答候補</p>
          <p className="text-[10px] text-zinc-700 bg-blue-50 p-2 rounded border border-blue-100 whitespace-pre-wrap line-clamp-8 leading-relaxed">
            {result.replyCandidate}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-px bg-zinc-100" />
    </div>
  );
}

function Row({
  label, value, sub, children,
}: {
  label: string;
  value?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-zinc-400 w-24 shrink-0 pt-0.5">{label}</span>
      <div>
        {children ?? <span className="text-[11px] text-zinc-700">{value ?? "—"}</span>}
        {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const cls: Record<string, string> = {
    green: "bg-green-100 text-green-700 border-green-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
    red:   "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls[color] ?? cls.green}`}>
      {children}
    </span>
  );
}

function ReplySourceBadge({ source }: { source: string }) {
  const cls: Record<string, string> = {
    skill:         "bg-green-100 text-green-700 border-green-200",
    next_question: "bg-blue-100 text-blue-700 border-blue-200",
    escalation:    "bg-red-100 text-red-700 border-red-200",
    fallback:      "bg-zinc-100 text-zinc-600 border-zinc-200",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls[source] ?? cls.fallback}`}>
      {source}
    </span>
  );
}
