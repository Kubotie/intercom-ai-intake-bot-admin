import { Card, CardContent } from "@/components/ui/card";
import { Badge, categoryBadge } from "@/components/ui/badge";
import { Zap, CheckCircle2, Clock } from "lucide-react";

const SKILLS = [
  {
    name: "faq_answer",
    status: "active",
    intents: ["experience_issue", "usage_guidance"],
    source: "notion_faq",
    threshold: 0.65,
    priority: { experience_issue: 1, usage_guidance: 2 },
    desc: "Notion FAQ (knowledge_chunks) から候補を最大5件取得し LLM で回答生成。トラブルシューティング型87件が強み。",
  },
  {
    name: "help_center_answer",
    status: "active",
    intents: ["usage_guidance", "experience_issue"],
    source: "help_center",
    threshold: 0.65,
    priority: { usage_guidance: 1, experience_issue: 2 },
    desc: "Ptengine Help Center を検索し記事本文を取得して LLM で回答生成。使い方・設定手順に強み。",
  },
  {
    name: "known_bug_match",
    status: "active",
    intents: ["bug_report"],
    source: "known_issue",
    threshold: 0.7,
    priority: { bug_report: 1 },
    desc: "support_ai_known_issues テーブルとキーワードマッチ。published_to_bot=true のみ返答に使用。",
  },
  {
    name: "account_recovery_hint",
    status: "planned",
    intents: ["login_account"],
    source: "—",
    threshold: 0.7,
    priority: {},
    desc: "ログイン・アカウント問題向け skill（未実装）",
  },
  {
    name: "tracking_debug_guide",
    status: "planned",
    intents: ["tracking_issue"],
    source: "—",
    threshold: 0.7,
    priority: {},
    desc: "タグ設置・計測問題の診断ガイド skill（未実装）",
  },
];

const sourceColor: Record<string, "purple" | "info" | "warning" | "muted"> = {
  notion_faq:  "purple",
  help_center: "info",
  known_issue: "warning",
};

export default function SkillsPage() {
  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Skills</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Skill 一覧・設定・実行順序</p>
      </div>

      <div className="space-y-3">
        {SKILLS.map(skill => (
          <Card key={skill.name}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                    skill.status === "active" ? "bg-zinc-900" : "bg-zinc-100"
                  }`}>
                    <Zap size={14} className={skill.status === "active" ? "text-white" : "text-zinc-400"} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">{skill.name}</span>
                      {skill.status === "active"
                        ? <span className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded"><CheckCircle2 size={10} /> active</span>
                        : <span className="flex items-center gap-1 text-[11px] text-zinc-500 bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded"><Clock size={10} /> planned</span>
                      }
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-3">{skill.desc}</p>
                    <div className="grid grid-cols-4 gap-4 text-xs">
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Intents</p>
                        <div className="space-y-1">
                          {skill.intents.map(i => (
                            <div key={i} className="flex items-center gap-1">
                              {categoryBadge(i)}
                              {skill.priority[i as keyof typeof skill.priority] && (
                                <span className="text-[10px] text-[var(--text-muted)]">
                                  #{skill.priority[i as keyof typeof skill.priority]}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Source</p>
                        <Badge variant={sourceColor[skill.source] ?? "muted"}>{skill.source}</Badge>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Threshold</p>
                        <span className="font-mono text-[var(--text-secondary)]">≥ {skill.threshold}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
