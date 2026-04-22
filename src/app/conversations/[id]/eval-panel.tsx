"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/nocodb";
import { ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";

const BAD_REASONS: { key: string; label: string }[] = [
  { key: "intent_misclassification", label: "Intent 分類ミス" },
  { key: "skill_misrouting",         label: "Skill 選択ミス" },
  { key: "knowledge_miss",           label: "知識不足" },
  { key: "answer_too_vague",         label: "回答が曖昧" },
  { key: "over_handoff",             label: "早すぎる Handoff" },
  { key: "over_questioning",         label: "質問が多すぎる" },
  { key: "tone_mismatch",            label: "トーン不適切" },
  { key: "wrong_knowledge_source",   label: "知識ソース誤り" },
];

export function EvalPanel({ session }: { session: Session }) {
  const [eval_, setEval]    = useState(session.evaluation ?? "");
  const [reason, setReason] = useState(session.eval_reason ?? "");
  const [comment, setComment] = useState("");
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch("/api/sessions/eval", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId: session.Id, evaluation: eval_, evalReason: reason + (comment ? ` | ${comment}` : "") }),
    });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card>
      <CardHeader><CardTitle>評価 / Evaluation</CardTitle></CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Good / Bad */}
        <div className="flex gap-2">
          <button
            onClick={() => setEval("good")}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md border text-sm font-medium transition-colors ${
              eval_ === "good" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-zinc-50"
            }`}
          >
            <ThumbsUp size={14} /> Good
          </button>
          <button
            onClick={() => setEval("bad")}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md border text-sm font-medium transition-colors ${
              eval_ === "bad" ? "bg-red-50 border-red-300 text-red-700" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-zinc-50"
            }`}
          >
            <ThumbsDown size={14} /> Bad
          </button>
        </div>

        {/* Reason tags (bad のみ) */}
        {eval_ === "bad" && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">理由</p>
            <div className="flex flex-wrap gap-1.5">
              {BAD_REASONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setReason(key === reason ? "" : key)}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                    reason === key ? "bg-red-50 border-red-300 text-red-700" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-zinc-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        <div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="コメント（任意）"
            rows={2}
            className="w-full text-xs border border-[var(--border)] rounded-md px-3 py-2 resize-none bg-zinc-50 text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-zinc-300"
          />
        </div>

        <Button size="md" className="w-full" onClick={save} disabled={!eval_ || saving}>
          {saved ? <><CheckCircle2 size={14} /> 保存しました</> : saving ? "保存中…" : "評価を保存"}
        </Button>

        {/* Improvement shortcuts */}
        <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
          <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">改善候補に送る</p>
          {[
            ["Policy 改善候補", "/policies"],
            ["Intent 修正候補", "/intents"],
            ["Knowledge 不足",  "/knowledge"],
            ["Skill 改善候補",  "/skills"],
          ].map(([label, href]) => (
            <a key={href} href={href}
              className="flex items-center justify-between text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
            >
              <span>{label}</span>
              <span className="text-[var(--text-muted)]">→</span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
