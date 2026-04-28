"use client";
import type { HandoffCheckNodeData } from "@/lib/workflow-types";
import {
  HANDOFF_MIN_CONDITION_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
} from "@/lib/bot/categories.js";

import type { HandoffPreset } from "@/lib/workflow-editor-types";
import { HANDOFF_PRESET_META } from "@/lib/workflow-editor-types";

interface Props {
  data: HandoffCheckNodeData;
  onClose: () => void;
  effectivePreset?: HandoffPreset;
  onPresetChange?: (preset: HandoffPreset) => void;
}


export function HandoffCheckPanel({ data, onClose, effectivePreset, onPresetChange }: Props) {
  const condition = (
    HANDOFF_MIN_CONDITION_BY_CATEGORY as Record<string, { required: string[]; any_of: string[][] }>
  )[data.category];

  const slotPriority = (SLOT_PRIORITY_BY_CATEGORY as Record<string, string[]>)[data.category] ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900 text-sm">ハンドオフ判定</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">{data.category}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-zinc-600">{data.handoffDesc}</p>

      {condition ? (
        <div className="space-y-3">
          {/* Required slots */}
          {condition.required.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                必須スロット
              </p>
              <div className="flex flex-wrap gap-1">
                {condition.required.map((s) => (
                  <SlotChip key={s} name={s} color="red" priority={slotPriority.indexOf(s)} />
                ))}
              </div>
            </div>
          )}

          {/* any_of groups */}
          {condition.any_of.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                いずれか（any_of）
              </p>
              <div className="space-y-1.5">
                {condition.any_of.map((group, i) => (
                  <div key={i} className="flex flex-wrap gap-1 items-center">
                    <span className="text-[10px] text-zinc-400 w-5">or</span>
                    {group.map((s) => (
                      <SlotChip key={s} name={s} color="amber" priority={slotPriority.indexOf(s)} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {condition.required.length === 0 && condition.any_of.length === 0 && (
            <p className="text-xs text-zinc-500 italic">
              最小条件なし — スロット収集完了次第ハンドオフ
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">条件定義が見つかりません</p>
      )}

      {/* Slot collection priority order */}
      {slotPriority.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
            収集優先順位
          </p>
          <div className="flex flex-wrap gap-1 items-center">
            {slotPriority.map((s, i) => (
              <span key={s} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-[10px] text-zinc-300">→</span>}
                <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
                  {s}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Handoff preset (editable) */}
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-amber-700">ハンドオフ強度（このカテゴリ）</p>
        <div className="space-y-1.5">
          {(["strict", "balanced", "lenient"] as HandoffPreset[]).map((preset) => {
            const meta = HANDOFF_PRESET_META[preset];
            const active = (effectivePreset ?? "balanced") === preset;
            return (
              <button
                key={preset}
                onClick={() => onPresetChange?.(preset)}
                disabled={!onPresetChange}
                className={`w-full flex items-start gap-2 text-left px-2.5 py-2 rounded-lg border transition-colors ${
                  active
                    ? "border-amber-400 bg-amber-100"
                    : "border-transparent bg-white hover:bg-amber-50 disabled:hover:bg-white"
                }`}
              >
                <span className={`text-[10px] font-semibold pt-0.5 shrink-0 ${active ? "text-amber-700" : "text-zinc-500"}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] text-zinc-500 leading-snug">{meta.desc}</span>
              </button>
            );
          })}
        </div>
        {!onPresetChange && (
          <p className="text-[10px] text-zinc-400">ワークフローを選択すると編集できます</p>
        )}
      </div>

      <div className="pt-1 border-t border-zinc-100">
        <p className="text-[10px] text-zinc-400">
          定義元: <code className="font-mono bg-zinc-100 px-1 rounded">categories.js</code>
          ›
          <code className="font-mono bg-zinc-100 px-1 rounded ml-1">HANDOFF_MIN_CONDITION_BY_CATEGORY</code>
        </p>
      </div>
    </div>
  );
}

function SlotChip({
  name, color, priority,
}: {
  name: string;
  color: "red" | "amber";
  priority: number;
}) {
  const cls = {
    red:   "bg-red-50 text-red-700 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  }[color];
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls} flex items-center gap-1`}>
      {name}
      {priority >= 0 && (
        <span className="text-[9px] opacity-60">#{priority + 1}</span>
      )}
    </span>
  );
}
