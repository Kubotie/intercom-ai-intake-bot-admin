import {
  REQUIRED_SLOTS_BY_CATEGORY,
  REQUIRED_SLOT_NAMES_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
  HANDOFF_MIN_CONDITION_BY_CATEGORY,
  CATEGORY_LIST,
} from "@/lib/bot/categories.js";
import { categoryBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// ── 静的メタデータ ────────────────────────────────────────────
const INTENT_META: Record<string, {
  label: string;
  desc: string;
  representativeUtterances: string[];
  priority: number;
  knowledgeFirst: boolean;
  skills: string[];
  skillDescriptions: string[];
}> = {
  billing_contract: {
    label: "請求・契約",
    desc: "解約・プラン変更・請求書確認・支払い方法",
    representativeUtterances: ["解約したい", "プラン変更の方法は？", "請求書を確認したい", "キャンセル手続きを教えてください"],
    priority: 1,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に直接引き継ぎ"],
  },
  login_account: {
    label: "ログイン・アカウント",
    desc: "ログイン不可・権限エラー・アカウント招待・パスワード",
    representativeUtterances: ["ログインできない", "パスワードを忘れた", "アカウントにアクセスできない", "招待メールが届かない"],
    priority: 2,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に直接引き継ぎ"],
  },
  experience_issue: {
    label: "体験・表示・配信問題",
    desc: "体験/ポップアップ/A-Bテスト の表示不具合・配信停止・インプレッション0",
    representativeUtterances: ["ABテストが反映されない", "ポップアップが表示されない", "体験を公開したのに0インプレッション", "プレビューが古いデザインのまま"],
    priority: 3,
    knowledgeFirst: true,
    skills: ["faq_answer", "help_center_answer"],
    skillDescriptions: [
      "Notion FAQ（トラブルシューティング37件、最優先）",
      "Ptengine Help Center（FAQ fallback）",
    ],
  },
  tracking_issue: {
    label: "計測・トラッキング問題",
    desc: "タグ未検出・GTMエラー・ページビュー計測されない",
    representativeUtterances: ["計測できていない", "GTMタグが検出されない", "Ptengineのタグを設置したのに反応しない", "特定ページでデータが取れない"],
    priority: 4,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に引き継ぎ"],
  },
  bug_report: {
    label: "機能不具合",
    desc: "明確なエラーメッセージ・操作不能・画面フリーズ",
    representativeUtterances: ["エラーが出て保存できない", "ボタンを押しても反応しない", "画面が真っ白になる", "特定の操作でクラッシュする"],
    priority: 5,
    knowledgeFirst: false,
    skills: ["known_bug_match"],
    skillDescriptions: ["既知バグDB（support_ai_known_issues テーブル）と照合"],
  },
  usage_guidance: {
    label: "使い方・設定方法",
    desc: "機能の操作方法・設定箇所の案内・やり方が分からない",
    representativeUtterances: ["ABテストの作り方を教えてほしい", "リダイレクトテストはどこから設定？", "ヒートマップの見方が分からない", "セグメントの設定方法は？"],
    priority: 6,
    knowledgeFirst: true,
    skills: ["help_center_answer", "faq_answer"],
    skillDescriptions: [
      "Ptengine Help Center（How-to コンテンツが豊富、最優先）",
      "Notion FAQ（Help Center fallback）",
    ],
  },
  report_difference: {
    label: "数値差異",
    desc: "GA4・社内集計・Ptengine レポートの数値が合わない",
    representativeUtterances: ["GA4と数値が違う", "先週と比べてセッション数が大幅に減った", "社内ツールとPVが一致しない", "コンバージョン数がおかしい"],
    priority: 7,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に引き継ぎ"],
  },
};

const SLOT_LABELS: Record<string, string> = {
  project_name_or_id:    "プロジェクト名/ID",
  target_url:            "対象 URL",
  symptom:               "症状",
  occurred_at:           "発生日時",
  recent_change:         "最近の変更",
  tag_type:              "タグ種別",
  report_name:           "レポート名",
  date_range:            "対象期間",
  compare_target:        "比較対象",
  expected_value:        "期待値",
  actual_value:          "実際の値",
  account_email_or_user: "メール/ユーザー名",
  occurred_screen:       "発生画面",
  error_message:         "エラーメッセージ",
  contract_target:       "契約対象",
  inquiry_topic:         "問い合わせ内容",
  target_period:         "対象期間",
  cancellation_reason:   "解約理由",
  reproduction_steps:    "再現手順",
  experience_name:       "体験名/ポップアップ名",
  target_feature:        "対象機能",
  user_goal:             "やりたいこと",
  feature_category:      "機能種別",
  device_type:           "デバイス",
};

type HandoffCondition = { required: string[]; any_of: string[][] };

function handoffConditionText(cond: HandoffCondition, category: string): string {
  const parts: string[] = [];
  if (cond.required.length > 0) {
    parts.push(`必須: ${cond.required.map(s => SLOT_LABELS[s] ?? s).join(" + ")}`);
  }
  if (cond.any_of.length > 0) {
    const anyParts = cond.any_of.map(arr => arr.map(s => SLOT_LABELS[s] ?? s).join(" or "));
    parts.push(`いずれか: ${anyParts.join("、")}`);
  }
  if (parts.length === 0) return "条件なし（即時引き継ぎ）";
  if (category === "billing_contract") {
    return parts.join(" / ") + "（解約時は メール/ユーザー名 も必須）";
  }
  return parts.join(" / ");
}

export default function IntentsPage() {
  const sortedCategories = (CATEGORY_LIST as string[]).sort(
    (a, b) => (INTENT_META[a]?.priority ?? 99) - (INTENT_META[b]?.priority ?? 99)
  );

  return (
    <div className="p-6 max-w-[1100px]">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">Intents & Routing</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Intent 定義・スロット構成・Skill ルーティング（categories.js / skills/registry.js から読み込み）
        </p>
      </div>

      {/* Improvement guide */}
      <div className="mb-6 p-3 rounded-lg border border-amber-100 bg-amber-50 flex items-start gap-2 text-xs text-amber-800">
        <span className="mt-0.5">💡</span>
        <span>
          <strong>改善導線：</strong>
          Evaluation で <code className="bg-amber-100 px-1 rounded">intent_misclassification</code> が多い場合は classifier_prompt を見直してください（/policies → プロンプト）。
          <code className="bg-amber-100 px-1 rounded">skill_misrouting</code> は Skill 欄のスキル順を確認し skills/registry.js を更新してください。
        </span>
      </div>

      {/* Global routing flow */}
      <Card className="mb-6">
        <CardHeader><CardTitle>処理フロー全体像</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-stretch gap-0 text-xs">
            {[
              { label: "顧客メッセージ", sub: null, color: "bg-zinc-700 text-white" },
              null,
              { label: "Classifier", sub: "7 intent 分類", color: "bg-blue-600 text-white" },
              null,
              { label: "Slot Extractor", sub: "LLM でスロット抽出", color: "bg-indigo-600 text-white" },
              null,
              { label: "knowledge-first?", sub: "usage_guidance\nexperience_issue", color: "bg-purple-600 text-white", fork: true },
              null,
              { label: "Skill Orchestrator", sub: "FAQ / HC / 既知バグ", color: "bg-emerald-600 text-white" },
              null,
              { label: "Handoff Check", sub: "最小条件を満たすか", color: "bg-amber-600 text-white" },
              null,
              { label: "Reply Resolver", sub: "返信文を決定", color: "bg-zinc-600 text-white" },
            ].map((step, i) =>
              step === null ? (
                <div key={i} className="flex items-center text-zinc-300 text-base">→</div>
              ) : (
                <div key={i} className={`rounded-md px-3 py-2 ${step.color} ${step.fork ? "border-2 border-purple-400 border-dashed" : ""}`}>
                  <p className="font-semibold">{step.label}</p>
                  {step.sub && <p className="text-[10px] opacity-75 whitespace-pre mt-0.5">{step.sub}</p>}
                </div>
              )
            )}
          </div>
          <div className="flex gap-4 mt-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-600 inline-block" />knowledge-first (Skill → Handoff 順)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-600 inline-block" />通常 (Handoff → 追加質問 順)</span>
          </div>
        </CardContent>
      </Card>

      {/* Intent cards */}
      <div className="space-y-4">
        {sortedCategories.map(category => {
          const meta = INTENT_META[category] ?? {
            label: category,
            desc: "",
            representativeUtterances: [],
            priority: 99,
            knowledgeFirst: false,
            skills: [],
            skillDescriptions: [],
          };
          const allSlots = (REQUIRED_SLOTS_BY_CATEGORY as Record<string, string[]>)[category] ?? [];
          const requiredSlots = new Set((REQUIRED_SLOT_NAMES_BY_CATEGORY as Record<string, string[]>)[category] ?? []);
          const priorityOrder = (SLOT_PRIORITY_BY_CATEGORY as Record<string, string[]>)[category] ?? allSlots;
          const handoffCond = (HANDOFF_MIN_CONDITION_BY_CATEGORY as Record<string, HandoffCondition>)[category] ?? { required: [], any_of: [] };

          return (
            <details key={category} className="group rounded-xl border border-[var(--border)] bg-white overflow-hidden">
              <summary className="flex items-start justify-between gap-4 p-4 cursor-pointer hover:bg-zinc-50 list-none select-none">
                <div className="flex items-center gap-3">
                  {categoryBadge(category)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{meta.label}</span>
                      <span className="text-xs text-zinc-400">分類優先度 {meta.priority}</span>
                      {meta.knowledgeFirst && (
                        <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded">knowledge-first</span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{meta.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs text-zinc-400">
                  <span className="hidden group-open:block">▼ 閉じる</span>
                  <span className="group-open:hidden">▶ 詳細</span>
                </div>
              </summary>

              <div className="border-t border-[var(--border-subtle)] px-5 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: utterances + routing */}
                  <div className="space-y-4">
                    {/* Representative utterances */}
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">代表発話例</p>
                      <div className="space-y-1">
                        {meta.representativeUtterances.map(u => (
                          <div key={u} className="text-xs text-zinc-600 bg-zinc-50 px-3 py-1.5 rounded border border-zinc-100">
                            &ldquo;{u}&rdquo;
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Routing flow for this intent */}
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">処理フロー</p>
                      <div className="space-y-1.5">
                        <FlowStep n={1} label="Classifier" detail={`優先度 ${meta.priority} / 7`} color="blue" />
                        <FlowStep n={2} label="Slot Extractor" detail={`${allSlots.length} スロット定義`} color="indigo" />
                        {meta.knowledgeFirst ? (
                          <>
                            <FlowStep n={3} label="Skill Orchestrator" detail={meta.skills.join(" → ")} color="purple" highlight />
                            <FlowStep n={4} label="Handoff Check" detail={handoffConditionText(handoffCond, category)} color="amber" />
                          </>
                        ) : (
                          <>
                            <FlowStep n={3} label="Handoff Check" detail={handoffConditionText(handoffCond, category)} color="amber" />
                            {meta.skills.length > 0 && (
                              <FlowStep n={4} label="Skill Orchestrator" detail={meta.skills.join(" → ")} color="emerald" />
                            )}
                          </>
                        )}
                        <FlowStep n={meta.skills.length > 0 || meta.knowledgeFirst ? 5 : 4} label="Reply Resolver" detail="escalation / handoff / skill / next_message / fallback" color="zinc" />
                      </div>
                    </div>
                  </div>

                  {/* Right: slots + skill detail */}
                  <div className="space-y-4">
                    {/* Slot table */}
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">スロット（聴取順）</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-zinc-50">
                            <th className="text-left px-2 py-1.5 border border-zinc-100 text-[10px] font-semibold text-zinc-500 uppercase w-6">#</th>
                            <th className="text-left px-2 py-1.5 border border-zinc-100 text-[10px] font-semibold text-zinc-500 uppercase">スロット名</th>
                            <th className="text-left px-2 py-1.5 border border-zinc-100 text-[10px] font-semibold text-zinc-500 uppercase">ラベル</th>
                            <th className="text-left px-2 py-1.5 border border-zinc-100 text-[10px] font-semibold text-zinc-500 uppercase">区分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {priorityOrder.map((slot, idx) => (
                            <tr key={slot} className={idx % 2 === 0 ? "" : "bg-zinc-50"}>
                              <td className="px-2 py-1.5 border border-zinc-100 text-zinc-400 tabular-nums">{idx + 1}</td>
                              <td className="px-2 py-1.5 border border-zinc-100 font-mono text-zinc-600">{slot}</td>
                              <td className="px-2 py-1.5 border border-zinc-100 text-zinc-600">{SLOT_LABELS[slot] ?? slot}</td>
                              <td className="px-2 py-1.5 border border-zinc-100">
                                {requiredSlots.has(slot) ? (
                                  <span className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded text-[10px]">必須収集</span>
                                ) : (
                                  <span className="bg-zinc-50 text-zinc-400 border border-zinc-100 px-1.5 py-0.5 rounded text-[10px]">任意</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Skills */}
                    {meta.skills.length > 0 && (
                      <div>
                        <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">Skill 実行順</p>
                        <div className="space-y-1.5">
                          {meta.skills.map((skill, i) => (
                            <div key={skill} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                              <div>
                                <span className="font-mono font-semibold text-emerald-700">{skill}</span>
                                <p className="text-zinc-500 mt-0.5">{meta.skillDescriptions[i]}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-zinc-400 mt-2">採用条件: confidence ≥ 0.65（共通）</p>
                      </div>
                    )}

                    {/* Handoff condition detail */}
                    <div>
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Handoff 条件</p>
                      <p className="text-xs text-zinc-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
                        {handoffConditionText(handoffCond, category)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function FlowStep({ n, label, detail, color, highlight }: {
  n: number; label: string; detail: string; color: string; highlight?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue:    "bg-blue-50 border-blue-200 text-blue-700",
    indigo:  "bg-indigo-50 border-indigo-200 text-indigo-700",
    purple:  "bg-purple-50 border-purple-200 text-purple-700",
    amber:   "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    zinc:    "bg-zinc-50 border-zinc-200 text-zinc-600",
  };
  const cls = colorMap[color] ?? colorMap.zinc;
  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${cls} ${highlight ? "ring-1 ring-purple-300" : ""}`}>
      <span className="shrink-0 font-bold tabular-nums">{n}.</span>
      <div>
        <span className="font-semibold">{label}</span>
        <span className="ml-2 opacity-70 text-[10px]">{detail}</span>
      </div>
    </div>
  );
}
