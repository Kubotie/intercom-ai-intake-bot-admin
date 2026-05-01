"use client";
import { INTENT_META } from "@/lib/workflow-types";
import { useSkills } from "@/hooks/use-skills";
import type { IntentsConfigJson, IntentCategoryConfig } from "@/lib/workflow-editor-types";

const SKILL_DESCRIPTIONS: Record<string, string> = {
  help_center_answer: "Ptengine ヘルプセンターの記事を検索して回答します。機能の使い方・仕様に関する質問に有効です。",
  faq_answer:         "Notion FAQ データベースから回答を検索します。よくある質問のパターンに有効です。",
  known_bug_match:    "既知バグデータベースと照合し、報告済み不具合を案内します。技術的問題の問い合わせに有効です。",
};

interface Props {
  config:   IntentsConfigJson;
  onChange: (config: IntentsConfigJson) => void;
}

export function SkillAssignmentEditor({ config, onChange }: Props) {
  const { skills, skillLabels, skillThresholds } = useSkills();
  const allSkills = skills.map(s => s.key);
  const categories = Object.entries(config.intents)
    .filter(([, v]) => v?.enabled !== false)
    .sort(([, a], [, b]) => (b.classifyPriority ?? 5) - (a.classifyPriority ?? 5));

  function getActiveSkills(category: string, intentConfig: IntentCategoryConfig): string[] {
    if ((intentConfig.skills ?? []).length > 0) {
      return intentConfig.skills.map(s => s.name);
    }
    // 未設定の場合は INTENT_META デフォルトを参照
    return INTENT_META[category]?.skills ?? [];
  }

  function getThreshold(category: string, skillName: string, intentConfig: IntentCategoryConfig): number {
    const found = intentConfig.skills?.find(s => s.name === skillName);
    if (found) return found.threshold;
    return skillThresholds[skillName] ?? 0.65;
  }

  function toggleSkill(category: string, intentConfig: IntentCategoryConfig, skillName: string, checked: boolean) {
    const metaDefaults = INTENT_META[category]?.skills ?? [];
    const base = (intentConfig.skills ?? []).length > 0
      ? intentConfig.skills
      : metaDefaults.map(name => ({ name, threshold: skillThresholds[name] ?? 0.65 }));

    const newSkills = checked
      ? [...base.filter(s => s.name !== skillName), { name: skillName, threshold: skillThresholds[skillName] ?? 0.65 }]
      : base.filter(s => s.name !== skillName);

    onChange({
      ...config,
      intents: {
        ...config.intents,
        [category]: { ...intentConfig, skills: newSkills },
      },
    });
  }

  function setThreshold(category: string, intentConfig: IntentCategoryConfig, skillName: string, value: number) {
    const metaDefaults = INTENT_META[category]?.skills ?? [];
    const base = (intentConfig.skills ?? []).length > 0
      ? intentConfig.skills
      : metaDefaults.map(name => ({ name, threshold: skillThresholds[name] ?? 0.65 }));

    const newSkills = base.some(s => s.name === skillName)
      ? base.map(s => s.name === skillName ? { ...s, threshold: value } : s)
      : [...base, { name: skillName, threshold: value }];

    onChange({
      ...config,
      intents: {
        ...config.intents,
        [category]: { ...intentConfig, skills: newSkills },
      },
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        各スキルをどのカテゴリで使用するか設定します。スキルは Knowledge ベースを検索して回答を試み、信頼度が閾値を超えた場合に採用されます。
      </p>

      {allSkills.map(skillName => {
        const usedIn = categories.filter(([cat, cfg]) =>
          getActiveSkills(cat, cfg).includes(skillName)
        );

        return (
          <div key={skillName} className="border border-zinc-200 rounded-lg overflow-hidden">
            {/* Skill header */}
            <div className="px-3 py-2.5 bg-zinc-50 border-b border-zinc-100">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[12px] font-semibold text-zinc-700">
                  {skillLabels[skillName] ?? skillName}
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  デフォルト閾値 {Math.round((skillThresholds[skillName] ?? 0.65) * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 leading-snug">
                {SKILL_DESCRIPTIONS[skillName] ?? skillName}
              </p>
              {usedIn.length > 0 && (
                <p className="text-[10px] text-blue-500 mt-1">
                  {usedIn.length} カテゴリで使用中
                </p>
              )}
            </div>

            {/* Category list */}
            <div className="divide-y divide-zinc-100">
              {categories.map(([category, intentConfig]) => {
                const active    = getActiveSkills(category, intentConfig).includes(skillName);
                const threshold = getThreshold(category, skillName, intentConfig);
                const label     = intentConfig.label ?? INTENT_META[category]?.label ?? category;

                return (
                  <div key={category} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      id={`${skillName}-${category}`}
                      checked={active}
                      onChange={e => toggleSkill(category, intentConfig, skillName, e.target.checked)}
                      className="w-3.5 h-3.5 accent-blue-600 shrink-0"
                    />
                    <label
                      htmlFor={`${skillName}-${category}`}
                      className="flex-1 text-[11px] text-zinc-700 cursor-pointer leading-tight"
                    >
                      {label}
                    </label>
                    {active && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-zinc-400">閾値</span>
                        <input
                          type="number"
                          min={0.1}
                          max={1.0}
                          step={0.05}
                          value={threshold}
                          onChange={e => setThreshold(category, intentConfig, skillName, Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          className="w-14 text-[10px] text-zinc-700 border border-zinc-200 rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-zinc-400"
                        />
                        <span className="text-[10px] text-zinc-400">
                          ({Math.round(threshold * 100)}%)
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {categories.length === 0 && (
                <p className="px-3 py-2 text-[11px] text-zinc-400">有効なカテゴリがありません</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
