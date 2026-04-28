"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import {
  REQUIRED_SLOTS_BY_CATEGORY,
  HANDOFF_MIN_CONDITION_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
} from "@/lib/bot/categories.js";
import { INTENT_META, SORTED_CATEGORIES } from "@/lib/workflow-types";
import type { IntentsConfigJson, IntentCategoryConfig, HandoffPreset } from "@/lib/workflow-editor-types";
import { HANDOFF_PRESET_META } from "@/lib/workflow-editor-types";

// slot 名 → 日本語ラベル
const SLOT_LABELS: Record<string, string> = {
  project_name_or_id:    "プロジェクト名またはID",
  target_url:            "対象URL",
  symptom:               "具体的な症状",
  occurred_at:           "発生日時",
  recent_change:         "最近の変更内容",
  tag_type:              "タグの設置方法",
  report_name:           "レポート名",
  date_range:            "対象期間",
  compare_target:        "比較対象",
  expected_value:        "期待値",
  actual_value:          "実際の値",
  account_email_or_user: "メールアドレスまたはユーザー名",
  occurred_screen:       "発生した画面",
  error_message:         "エラーメッセージ",
  contract_target:       "契約対象",
  inquiry_topic:         "お問い合わせ内容",
  target_period:         "対象期間",
  cancellation_reason:   "解約理由",
  reproduction_steps:    "再現手順",
  experience_name:       "体験名またはポップアップ名",
  target_feature:        "対象機能",
  user_goal:             "やりたいこと",
  feature_category:      "機能の種別",
  device_type:           "デバイス種別",
};

const SKILL_LABELS: Record<string, string> = {
  help_center_answer: "Help Center",
  faq_answer:         "Notion FAQ",
  known_bug_match:    "既知バグDB",
};

type SubTab = "slots" | "handoff" | "skills";

interface CategoryEditorProps {
  category: string;
  intentConfig: IntentCategoryConfig | null;
  onChange: (category: string, config: IntentCategoryConfig | null) => void;
}

function CategoryEditor({ category, intentConfig, onChange }: CategoryEditorProps) {
  const [subTab, setSubTab] = useState<SubTab>("slots");
  const meta = INTENT_META[category];

  const defaultSlots: string[] = REQUIRED_SLOTS_BY_CATEGORY[category as keyof typeof REQUIRED_SLOTS_BY_CATEGORY] ?? [];
  const defaultPriority: string[] = SLOT_PRIORITY_BY_CATEGORY[category as keyof typeof SLOT_PRIORITY_BY_CATEGORY] ?? defaultSlots;
  const defaultHandoff = HANDOFF_MIN_CONDITION_BY_CATEGORY[category as keyof typeof HANDOFF_MIN_CONDITION_BY_CATEGORY];
  const defaultSkills: string[] = meta?.skills ?? [];

  // Effective values (override or default)
  const effectiveSlots    = intentConfig?.slots?.required ?? defaultSlots;
  const effectivePriority = intentConfig?.slots?.priority ?? defaultPriority;
  const effectivePreset   = intentConfig?.handoff?.preset ?? null;
  const effectiveSkills   = intentConfig?.skills?.map(s => s.name) ?? defaultSkills;

  const isModified = intentConfig !== null;

  const update = (partial: Partial<IntentCategoryConfig>) => {
    const base: IntentCategoryConfig = intentConfig ?? {
      enabled: true,
      slots:   { required: defaultSlots, optional: [], priority: defaultPriority },
      handoff: { preset: "balanced", required: defaultHandoff?.required ?? [], any_of: defaultHandoff?.any_of ?? [] },
      skills:  defaultSkills.map(name => ({ name, threshold: 0.7 })),
    };
    onChange(category, { ...base, ...partial });
  };

  const reset = () => onChange(category, null);

  // Slot priority reordering
  const moveSlot = (idx: number, dir: -1 | 1) => {
    const next = [...effectivePriority];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= next.length) return;
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    const base = intentConfig ?? {
      enabled: true,
      slots:   { required: effectiveSlots, optional: [], priority: effectivePriority },
      handoff: { preset: "balanced", required: defaultHandoff?.required ?? [], any_of: defaultHandoff?.any_of ?? [] },
      skills:  effectiveSkills.map(name => ({ name, threshold: 0.7 })),
    };
    onChange(category, {
      ...base,
      slots: { ...(intentConfig?.slots ?? { required: effectiveSlots, optional: [] }), priority: next }
    });
  };

  // Skill reordering
  const moveSkill = (idx: number, dir: -1 | 1) => {
    const next = [...effectiveSkills];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= next.length) return;
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    const base = intentConfig ?? {
      enabled: true,
      slots:   { required: effectiveSlots, optional: [], priority: effectivePriority },
      handoff: { preset: "balanced", required: defaultHandoff?.required ?? [], any_of: defaultHandoff?.any_of ?? [] },
      skills:  defaultSkills.map(name => ({ name, threshold: 0.7 })),
    };
    onChange(category, {
      ...base,
      skills: next.map(name => {
        const existing = (intentConfig?.skills ?? []).find(s => s.name === name);
        return existing ?? { name, threshold: 0.7 };
      })
    });
  };

  const setHandoffPreset = (preset: HandoffPreset) => {
    const base = intentConfig ?? {
      enabled: true,
      slots:   { required: effectiveSlots, optional: [], priority: effectivePriority },
      handoff: { preset: "balanced", required: defaultHandoff?.required ?? [], any_of: defaultHandoff?.any_of ?? [] },
      skills:  effectiveSkills.map(name => ({ name, threshold: 0.7 })),
    };
    onChange(category, { ...base, handoff: { ...(base.handoff), preset } });
  };

  return (
    <div className="border border-zinc-200 rounded-md overflow-hidden">
      {/* Category header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50">
        <span className="flex-1 text-xs font-medium text-zinc-700">{meta?.label ?? category}</span>
        {isModified && (
          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">変更済</span>
        )}
        {isModified && (
          <button onClick={reset} className="text-zinc-400 hover:text-zinc-700" title="デフォルトに戻す">
            <RotateCcw size={11} />
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-zinc-100">
        {(["slots", "handoff", "skills"] as SubTab[]).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex-1 py-1 text-[11px] transition-colors ${
              subTab === t ? "text-zinc-800 font-medium border-b-2 border-zinc-700" : "text-zinc-400 hover:text-zinc-600"
            }`}
          >
            {t === "slots" ? "スロット" : t === "handoff" ? "Handoff" : "スキル"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">
        {subTab === "slots" && (
          <div>
            <p className="text-[10px] text-zinc-400 mb-2">収集優先順（上から順に質問）</p>
            {effectivePriority.length === 0 ? (
              <p className="text-[11px] text-zinc-400">このカテゴリはスロットなし</p>
            ) : (
              <div className="space-y-1">
                {effectivePriority.map((slotName, idx) => (
                  <div key={slotName} className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-400 w-4 text-right">{idx + 1}.</span>
                    <span className={`flex-1 text-[11px] px-2 py-0.5 rounded border ${
                      effectiveSlots.includes(slotName)
                        ? "bg-zinc-50 border-zinc-200 text-zinc-700"
                        : "bg-zinc-50 border-zinc-100 text-zinc-400"
                    }`}>
                      {SLOT_LABELS[slotName] ?? slotName}
                    </span>
                    <div className="flex flex-col">
                      <button onClick={() => moveSlot(idx, -1)} disabled={idx === 0}
                        className="text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none">▲</button>
                      <button onClick={() => moveSlot(idx, 1)} disabled={idx === effectivePriority.length - 1}
                        className="text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none">▼</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === "handoff" && (
          <div>
            <p className="text-[10px] text-zinc-400 mb-2">このカテゴリのみの handoff 判定基準</p>
            <div className="flex gap-1 mb-2">
              {(["strict", "balanced", "lenient"] as HandoffPreset[]).map(p => (
                <button
                  key={p}
                  onClick={() => setHandoffPreset(p)}
                  className={`flex-1 py-1 text-[11px] rounded border transition-colors ${
                    (effectivePreset ?? "balanced") === p
                      ? "bg-zinc-700 text-white border-zinc-700 font-medium"
                      : "text-zinc-500 border-zinc-200 hover:bg-zinc-50"
                  }`}
                >
                  {HANDOFF_PRESET_META[p].label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-400 leading-snug">
              {HANDOFF_PRESET_META[effectivePreset ?? "balanced"].desc}
            </p>
            {defaultHandoff && (
              <div className="mt-2 pt-2 border-t border-zinc-100">
                <p className="text-[10px] text-zinc-400 mb-1">現在の条件（categories.js）</p>
                {defaultHandoff.required.length > 0 && (
                  <p className="text-[10px] text-zinc-500">必須: {defaultHandoff.required.map(s => SLOT_LABELS[s] ?? s).join(", ")}</p>
                )}
                {defaultHandoff.any_of.map((group, i) => (
                  <p key={i} className="text-[10px] text-zinc-500">
                    いずれか: {group.map(s => SLOT_LABELS[s] ?? s).join(" / ")}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === "skills" && (
          <div>
            {effectiveSkills.length === 0 ? (
              <p className="text-[11px] text-zinc-400">このカテゴリはスキルなし（担当者に直接引き継ぎ）</p>
            ) : (
              <>
                <p className="text-[10px] text-zinc-400 mb-2">実行順序（上が先）</p>
                <div className="space-y-1">
                  {effectiveSkills.map((skillName, idx) => (
                    <div key={skillName} className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-400 w-4 text-right">{idx + 1}.</span>
                      <span className="flex-1 text-[11px] bg-zinc-50 border border-zinc-200 text-zinc-700 px-2 py-0.5 rounded">
                        {SKILL_LABELS[skillName] ?? skillName}
                      </span>
                      <div className="flex flex-col">
                        <button onClick={() => moveSkill(idx, -1)} disabled={idx === 0}
                          className="text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none">▲</button>
                        <button onClick={() => moveSkill(idx, 1)} disabled={idx === effectiveSkills.length - 1}
                          className="text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none">▼</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  config: IntentsConfigJson;
  onChange: (config: IntentsConfigJson) => void;
}

export function IntentConfigEditor({ config, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleCategoryChange = (category: string, catConfig: IntentCategoryConfig | null) => {
    const next = { ...config.intents };
    if (catConfig === null) {
      delete next[category];
    } else {
      next[category] = catConfig;
    }
    onChange({ ...config, intents: next });
  };

  const modifiedCount = Object.keys(config.intents).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-zinc-500 leading-snug">
          カテゴリごとのスロット優先順・handoff 条件・スキル順序を個別設定します。
        </p>
        {modifiedCount > 0 && (
          <span className="text-[10px] text-blue-600 font-medium shrink-0 ml-2">{modifiedCount}件変更</span>
        )}
      </div>

      {SORTED_CATEGORIES.map(category => {
        const isOpen = expanded === category;
        return (
          <div key={category}>
            <button
              onClick={() => setExpanded(isOpen ? null : category)}
              className="w-full flex items-center gap-1.5 py-1.5 text-left"
            >
              {isOpen ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-400" />}
              <span className="text-xs text-zinc-700">{INTENT_META[category]?.label ?? category}</span>
              {config.intents[category] && (
                <span className="ml-auto text-[10px] text-blue-600 font-medium">変更済</span>
              )}
            </button>
            {isOpen && (
              <CategoryEditor
                category={category}
                intentConfig={config.intents[category] ?? null}
                onChange={handleCategoryChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
