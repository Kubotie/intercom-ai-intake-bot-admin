import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FileText, ExternalLink } from "lucide-react";

const POLICIES = [
  { name: "Mission & Global Behavior",   file: "ai-support-bot-md/mission.md",                   desc: "Bot の目的・基本行動原則" },
  { name: "Source Priority",             file: "ai-support-bot-md/knowledge/policies/source_priority.md", desc: "FAQ vs Help Center 優先順位" },
  { name: "Handoff Policy",              file: "ai-support-bot-md/policies/handoff.md",           desc: "Handoff 条件・タイミング" },
  { name: "Escalation Policy",           file: "ai-support-bot-md/policies/escalation.md",        desc: "エスカレーション判断ルール" },
  { name: "Slot Collection Rules",       file: "ai-support-bot-md/prompts/slot_extractor_prompt.md", desc: "スロット抽出プロンプト" },
  { name: "Classifier Prompt",           file: "ai-support-bot-md/prompts/classifier_prompt.md", desc: "Intent 分類プロンプト" },
  { name: "Skills README",               file: "ai-support-bot-md/skills/README.md",              desc: "Skill Orchestration Framework" },
];

export default function PoliciesPage() {
  return (
    <div className="p-6 max-w-[900px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Policies</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Bot の行動ルール・プロンプト定義（md ファイル管理）
        </p>
      </div>

      <div className="space-y-3">
        {POLICIES.map(p => (
          <Card key={p.name}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText size={14} className="text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{p.desc}</p>
                    <p className="text-[10px] font-mono text-zinc-400 mt-1">{p.file}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">active</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50">
        <p className="text-sm text-[var(--text-muted)] text-center">
          Md エディタは次フェーズで追加予定。現在は VSCode でファイルを直接編集し git push → Vercel デプロイで反映。
        </p>
      </div>
    </div>
  );
}
