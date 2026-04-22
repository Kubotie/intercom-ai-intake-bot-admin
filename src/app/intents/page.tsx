import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { categoryBadge } from "@/components/ui/badge";

const INTENTS = [
  {
    name: "experience_issue",
    label: "体験・表示・データ問題",
    desc: "体験/ポップアップ/A・Bテスト/表示異常/配信問題",
    skills: ["faq_answer → help_center_answer"],
    slots: ["experience_name", "symptom", "device_type", "occurred_at", "project_name_or_id", "target_url"],
    handoff: "experience_name + symptom が揃ったら",
    priority: 3,
  },
  {
    name: "usage_guidance",
    label: "使い方・設定方法",
    desc: "機能の操作方法・設定箇所の案内",
    skills: ["help_center_answer → faq_answer"],
    slots: ["target_feature", "user_goal", "feature_category"],
    handoff: "target_feature + user_goal が揃ったら",
    priority: 6,
  },
  {
    name: "bug_report",
    label: "機能不具合",
    desc: "明確なエラー・操作不能・画面異常",
    skills: ["known_bug_match"],
    slots: ["symptom", "affected_feature", "reproduction_steps"],
    handoff: "symptom が揃ったら",
    priority: 5,
  },
  {
    name: "tracking_issue",
    label: "計測・トラッキング問題",
    desc: "タグ未検出・GTMエラー・計測されない",
    skills: ["(未実装)"],
    slots: ["symptom", "tag_type", "page_url"],
    handoff: "即時",
    priority: 4,
  },
  {
    name: "billing_contract",
    label: "請求・契約",
    desc: "解約・プラン変更・請求書確認",
    skills: ["(未実装)"],
    slots: ["request_type"],
    handoff: "即時",
    priority: 1,
  },
  {
    name: "login_account",
    label: "ログイン・アカウント",
    desc: "ログイン不可・権限・招待",
    skills: ["(未実装)"],
    slots: ["symptom"],
    handoff: "即時",
    priority: 2,
  },
  {
    name: "report_difference",
    label: "数値差異",
    desc: "GA4・社内集計との乖離",
    skills: ["(未実装)"],
    slots: ["metric_name", "difference_detail"],
    handoff: "metric_name が揃ったら",
    priority: 7,
  },
];

export default function IntentsPage() {
  return (
    <div className="p-6 max-w-[1000px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Intents & Routing</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Intent 定義・スロット構成・Skill ルーティング
        </p>
      </div>

      {/* Routing flow */}
      <Card className="mb-5">
        <CardHeader><CardTitle>Skill ルーティングフロー</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] font-mono">
            {["顧客メッセージ", "→", "Classifier", "→", "Slot Extractor", "→", "Handoff Check", "→", "Skill Orchestrator", "→", "Reply Resolver", "→", "Intercom 返信"].map((s, i) => (
              <span key={i} className={s === "→" ? "text-zinc-300" : "bg-zinc-100 px-2 py-1 rounded"}>{s}</span>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">
            knowledge-first: usage_guidance / experience_issue は Handoff より前に Skill を試す
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {INTENTS.sort((a, b) => a.priority - b.priority).map(intent => (
          <Card key={intent.name}>
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    {categoryBadge(intent.name)}
                    <span className="text-sm font-medium text-[var(--text-primary)]">{intent.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">優先度 {intent.priority}</span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">{intent.desc}</p>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Skills</p>
                      {intent.skills.map(s => (
                        <p key={s} className="font-mono text-[var(--text-secondary)]">{s}</p>
                      ))}
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Slots</p>
                      <div className="flex flex-wrap gap-1">
                        {intent.slots.map(s => (
                          <span key={s} className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded text-[10px] font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Handoff 条件</p>
                      <p className="text-[var(--text-secondary)]">{intent.handoff}</p>
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
