"use client";
import { INTENT_META, SKILL_LABELS } from "@/lib/workflow-types";
import type { SkillConfigJson } from "@/lib/workflow-editor-types";

interface Props {
  config: SkillConfigJson;
  onChange: (config: SkillConfigJson) => void;
}

// Only categories with 2+ skills have reorderable entries
const EDITABLE_CATEGORIES = Object.entries(INTENT_META)
  .filter(([, meta]) => meta.skills.length > 1)
  .sort(([, a], [, b]) => a.priority - b.priority);

export function SkillOrderEditor({ config, onChange }: Props) {
  const getOrder = (category: string): string[] =>
    config.category_skill_order[category] ?? INTENT_META[category].skills;

  const isModified = (category: string): boolean => {
    const override = config.category_skill_order[category];
    if (!override) return false;
    return JSON.stringify(override) !== JSON.stringify(INTENT_META[category].skills);
  };

  const move = (category: string, index: number, dir: "up" | "down") => {
    const order = [...getOrder(category)];
    const next  = dir === "up" ? index - 1 : index + 1;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    onChange({ ...config, category_skill_order: { ...config.category_skill_order, [category]: order } });
  };

  const reset = (category: string) => {
    const next = { ...config.category_skill_order };
    delete next[category];
    onChange({ ...config, category_skill_order: next });
  };

  if (EDITABLE_CATEGORIES.length === 0) {
    return <p className="text-xs text-zinc-400 py-4 text-center">編集可能なスキル順序がありません</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-400">
        カテゴリごとのスキル実行順序を変更します。変更は workflow に保存されます。
      </p>

      {EDITABLE_CATEGORIES.map(([category, meta]) => {
        const order    = getOrder(category);
        const modified = isModified(category);
        return (
          <div key={category} className={`rounded-md border p-3 ${modified ? "bg-blue-50 border-blue-200" : "bg-zinc-50 border-zinc-100"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-zinc-700">{meta.label}</span>
                {modified && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                    変更済み
                  </span>
                )}
              </div>
              {modified && (
                <button
                  onClick={() => reset(category)}
                  className="text-[10px] text-zinc-400 hover:text-zinc-600 underline"
                >
                  デフォルトに戻す
                </button>
              )}
            </div>

            <div className="space-y-1">
              {order.map((skill, i) => (
                <div
                  key={skill}
                  className="flex items-center gap-2 bg-white border border-zinc-200 rounded px-2.5 py-1.5"
                >
                  <span className="text-[11px] text-zinc-400 w-4 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="text-xs text-zinc-700 flex-1">{SKILL_LABELS[skill] ?? skill}</span>
                  <div className="flex gap-0.5 shrink-0">
                    <button
                      onClick={() => move(category, i, "up")}
                      disabled={i === 0}
                      className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-20 rounded hover:bg-zinc-100 text-[10px]"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(category, i, "down")}
                      disabled={i === order.length - 1}
                      className="w-5 h-5 flex items-center justify-center text-zinc-400 hover:text-zinc-700 disabled:opacity-20 rounded hover:bg-zinc-100 text-[10px]"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Read-only single-skill categories */}
      {Object.entries(INTENT_META)
        .filter(([, meta]) => meta.skills.length === 1)
        .map(([category, meta]) => (
          <div key={category} className="rounded-md border border-zinc-100 p-2.5 bg-white opacity-60">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600">{meta.label}</span>
              <span className="text-[10px] text-zinc-400">{SKILL_LABELS[meta.skills[0]] ?? meta.skills[0]}（順序変更不可）</span>
            </div>
          </div>
        ))}
    </div>
  );
}
