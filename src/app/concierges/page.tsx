"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, CheckCircle2, Bot } from "lucide-react";

type Concierge = {
  id: string; name: string; persona: string; style: string;
  intercomAccount: string; isMain: boolean; status: "active" | "test" | "inactive";
  allowedSkills: string[]; preferredSources: string[];
};

const DEFAULT_CONCIERGES: Concierge[] = [
  {
    id: "c1",
    name: "Ptengine サポート",
    persona: "丁寧・保守的。回答が確実でない場合は確認質問を優先する。",
    style: "formal",
    intercomAccount: "kubota@ptmind.com",
    isMain: true,
    status: "active",
    allowedSkills: ["faq_answer", "help_center_answer", "known_bug_match"],
    preferredSources: ["notion_faq", "help_center"],
  },
];

export default function ConciergePage() {
  const [concierges, setConcierges] = useState<Concierge[]>(DEFAULT_CONCIERGES);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm] = useState({
    name: "", persona: "", style: "formal", intercomAccount: "", status: "test" as const
  });

  const add = () => {
    if (!form.name || !form.intercomAccount) return;
    setConcierges(cs => [...cs, {
      id: `c${Date.now()}`, ...form, isMain: false,
      allowedSkills: ["faq_answer", "help_center_answer"],
      preferredSources: ["notion_faq", "help_center"],
    }]);
    setShowForm(false);
    setForm({ name: "", persona: "", style: "formal", intercomAccount: "", status: "test" });
  };

  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Concierges</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">サポートコンシェルジュ登録・管理</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(f => !f)}>
          <Plus size={13} /> 追加
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card className="mb-4">
          <CardHeader><CardTitle>新しいコンシェルジュを追加</CardTitle></CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">名前</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: サポートBot B" className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">Intercom アカウント</label>
                <input value={form.intercomAccount} onChange={e => setForm(f => ({ ...f, intercomAccount: e.target.value }))}
                  placeholder="email@example.com" className="w-full h-8 text-sm px-3 rounded-md border border-[var(--border)] bg-zinc-50 outline-none focus:ring-1 focus:ring-zinc-300" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] block mb-1">ペルソナ・トーン</label>
              <textarea value={form.persona} onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
                rows={2} placeholder="例: 簡潔で要点型。技術的な内容も平易に説明する。"
                className="w-full text-sm px-3 py-2 rounded-md border border-[var(--border)] bg-zinc-50 resize-none outline-none focus:ring-1 focus:ring-zinc-300" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={add}>追加する</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>キャンセル</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Concierge list */}
      <div className="space-y-3">
        {concierges.map(c => (
          <Card key={c.id}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{c.name}</span>
                    {c.isMain && (
                      <span className="flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        <CheckCircle2 size={10} /> メイン
                      </span>
                    )}
                    <Badge variant={c.status === "active" ? "success" : c.status === "test" ? "warning" : "muted"}>
                      {c.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">{c.persona || "ペルソナ未設定"}</p>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Intercom</p>
                      <p className="text-[var(--text-secondary)] font-mono text-[10px]">{c.intercomAccount}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Allowed Skills</p>
                      <div className="flex flex-wrap gap-1">
                        {c.allowedSkills.map(s => (
                          <span key={s} className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Sources</p>
                      <div className="flex flex-wrap gap-1">
                        {c.preferredSources.map(s => (
                          <span key={s} className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-5 p-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <div className="flex items-start gap-2">
          <Users size={14} className="text-zinc-400 mt-0.5 shrink-0" />
          <p className="text-xs text-[var(--text-muted)]">
            複数コンシェルジュ登録・切り替えには Intercom の Bot アカウント（Admin）がそれぞれ必要です。
            特定のポリシーを持つキャラクターごとに返答テストが可能になります。
            次フェーズでは A/B テスト割り当てとコンシェルジュ別スキルプロファイル設定を実装予定。
          </p>
        </div>
      </div>
    </div>
  );
}
