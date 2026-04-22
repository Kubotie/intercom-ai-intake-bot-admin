"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { categoryBadge, replySourceBadge } from "@/components/ui/badge";
import { FlaskConical, Send } from "lucide-react";

export default function SandboxPage() {
  const [message, setMessage] = useState("");
  const [result, setResult]   = useState<null | { category: string; reply_source: string; answer_message: string; confidence: number; retrieval_query: string; candidate_titles: string[] }>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!message.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setResult({
      category: "experience_issue",
      reply_source: "faq_answer",
      confidence: 0.78,
      retrieval_query: message + " 表示されない 表示異常",
      candidate_titles: ["ポップアップが表示されない", "体験が反映されない場合の確認手順"],
      answer_message: "（Sandbox は本番 Bot API への接続が必要です。次フェーズで実装予定）",
    });
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-[900px]">
      <div className="mb-6 flex items-center gap-2">
        <FlaskConical size={18} className="text-[var(--text-muted)]" />
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Sandbox</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">発話テスト — 本番会話を壊さずに検証</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Input */}
        <Card>
          <CardHeader><CardTitle>入力</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1.5">ユーザー発話</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="例: ポップアップが表示されません"
                className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[var(--text-muted)] font-medium block mb-1">Concierge</label>
                <select className="w-full h-7 px-2 rounded border border-[var(--border)] bg-white text-[var(--text-primary)] outline-none">
                  <option>Ptengine サポート</option>
                </select>
              </div>
              <div>
                <label className="text-[var(--text-muted)] font-medium block mb-1">Policy version</label>
                <select className="w-full h-7 px-2 rounded border border-[var(--border)] bg-white text-[var(--text-primary)] outline-none">
                  <option>latest (main)</option>
                </select>
              </div>
            </div>
            <Button size="md" onClick={run} disabled={!message.trim() || loading} className="w-full">
              <Send size={13} />
              {loading ? "実行中…" : "実行"}
            </Button>
          </CardContent>
        </Card>

        {/* Output */}
        <Card>
          <CardHeader><CardTitle>結果</CardTitle></CardHeader>
          <CardContent className="p-4">
            {!result && !loading && (
              <p className="text-sm text-[var(--text-muted)] text-center py-8">発話を入力して実行してください</p>
            )}
            {loading && (
              <div className="space-y-2 py-4">
                {[80, 60, 40].map(w => (
                  <div key={w} className={`h-4 bg-zinc-100 rounded animate-pulse`} style={{ width: `${w}%` }} />
                ))}
              </div>
            )}
            {result && !loading && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)] w-20">Intent</span>
                  {categoryBadge(result.category)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)] w-20">Source</span>
                  {replySourceBadge(result.reply_source)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-muted)] w-20">Confidence</span>
                  <span className="tabular-nums font-mono">{(result.confidence * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] mb-1 w-20">Query</p>
                  <p className="font-mono bg-zinc-50 px-2 py-1.5 rounded border border-[var(--border)] break-all">{result.retrieval_query}</p>
                </div>
                <div>
                  <p className="text-[var(--text-muted)] mb-1">Candidates</p>
                  {result.candidate_titles.map((t, i) => <p key={i} className="text-[var(--text-secondary)]">{i + 1}. {t}</p>)}
                </div>
                <div>
                  <p className="text-[var(--text-muted)] mb-1">Reply</p>
                  <p className="text-[var(--text-secondary)] bg-zinc-50 px-2 py-1.5 rounded border border-[var(--border)]">{result.answer_message}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
