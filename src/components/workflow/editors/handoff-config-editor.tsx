"use client";
import { INTENT_META, SORTED_CATEGORIES } from "@/lib/workflow-types";
import type { HandoffConfigJson, HandoffPreset } from "@/lib/workflow-editor-types";
import { HANDOFF_PRESET_META } from "@/lib/workflow-editor-types";

interface Props {
  config:   HandoffConfigJson;
  onChange: (config: HandoffConfigJson) => void;
}

const PRESETS: HandoffPreset[] = ["strict", "balanced", "lenient"];

const PRESET_BUTTON_STYLE: Record<HandoffPreset, string> = {
  strict:   "bg-red-50 text-red-700 border-red-200",
  balanced: "bg-zinc-100 text-zinc-700 border-zinc-200",
  lenient:  "bg-green-50 text-green-700 border-green-200",
};

export function HandoffConfigEditor({ config, onChange }: Props) {
  const setGlobal = (preset: HandoffPreset) => onChange({ ...config, global_preset: preset });

  const setCategory = (category: string, preset: HandoffPreset) => {
    const next = { ...config.category_presets };
    if (preset === config.global_preset) {
      delete next[category];
    } else {
      next[category] = preset;
    }
    onChange({ ...config, category_presets: next });
  };

  const clearCategory = (category: string) => {
    const next = { ...config.category_presets };
    delete next[category];
    onChange({ ...config, category_presets: next });
  };

  const effectivePreset = (category: string): HandoffPreset =>
    config.category_presets[category] ?? config.global_preset;

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-400">
        handoff の判断基準を設定します。strict = スロット収集を重視、lenient = 早期引き継ぎ。
      </p>

      {/* Global preset */}
      <div className="border border-zinc-200 rounded-md p-3 bg-zinc-50">
        <p className="text-xs font-medium text-zinc-700 mb-2">グローバル設定（全カテゴリの基本値）</p>
        <div className="flex gap-1.5">
          {PRESETS.map(preset => {
            const { label } = HANDOFF_PRESET_META[preset];
            const active    = config.global_preset === preset;
            return (
              <button
                key={preset}
                onClick={() => setGlobal(preset)}
                className={`flex-1 text-xs px-2 py-2 rounded-md border transition-colors font-medium ${
                  active
                    ? PRESET_BUTTON_STYLE[preset]
                    : "bg-white text-zinc-400 border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-zinc-500 mt-1.5">{HANDOFF_PRESET_META[config.global_preset].desc}</p>
      </div>

      {/* Per-category overrides */}
      <div>
        <p className="text-xs font-medium text-zinc-600 mb-2">カテゴリ別上書き</p>
        <div className="space-y-1.5">
          {SORTED_CATEGORIES.map(category => {
            const meta      = INTENT_META[category];
            const effective = effectivePreset(category);
            const overridden = !!config.category_presets[category] &&
              config.category_presets[category] !== config.global_preset;

            return (
              <div
                key={category}
                className={`rounded border px-3 py-2 ${overridden ? "bg-blue-50 border-blue-200" : "bg-white border-zinc-100"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-zinc-700 truncate">{meta.label}</span>
                    {overridden && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1 py-0.5 rounded shrink-0 font-medium">
                        上書き
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={effective}
                      onChange={e => setCategory(category, e.target.value as HandoffPreset)}
                      className="text-[11px] border border-zinc-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-zinc-300"
                    >
                      {PRESETS.map(p => (
                        <option key={p} value={p}>
                          {HANDOFF_PRESET_META[p].label}
                          {p === config.global_preset && !overridden ? " (共通)" : ""}
                        </option>
                      ))}
                    </select>
                    {overridden && (
                      <button
                        onClick={() => clearCategory(category)}
                        className="text-zinc-400 hover:text-zinc-600 text-xs px-1"
                        title="共通設定に戻す"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="border border-zinc-100 rounded-md p-2.5 bg-zinc-50 space-y-1">
        {PRESETS.map(p => (
          <div key={p} className="flex gap-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PRESET_BUTTON_STYLE[p]} shrink-0`}>
              {HANDOFF_PRESET_META[p].label}
            </span>
            <span className="text-[10px] text-zinc-500">{HANDOFF_PRESET_META[p].desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
