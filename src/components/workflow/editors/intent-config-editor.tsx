"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { INTENT_META, SORTED_CATEGORIES } from "@/lib/workflow-types";
import type { IntentsConfigJson, IntentCategoryConfig } from "@/lib/workflow-editor-types";

interface CategoryEditorProps {
  category: string;
  intentConfig: IntentCategoryConfig | undefined;
  onChange: (category: string, config: IntentCategoryConfig) => void;
}

function CategoryEditor({ category, intentConfig, onChange }: CategoryEditorProps) {
  const [classifyOpen, setClassifyOpen] = useState(false);
  const meta = INTENT_META[category];

  const enabled = intentConfig?.enabled ?? true;
  const nlInstruction = intentConfig?.nlInstruction ?? "";
  const classifyDescription = intentConfig?.classifyDescription ?? "";
  const classifyExamples = intentConfig?.classifyExamples ?? [];
  const classifyPriority = intentConfig?.classifyPriority ?? 5;
  const classifyBoundaryNotes = intentConfig?.classifyBoundaryNotes ?? "";
  const label = intentConfig?.label ?? "";

  const update = (partial: Partial<IntentCategoryConfig>) => {
    const base: IntentCategoryConfig = intentConfig ?? {
      enabled: true,
      slots: { required: [], optional: [], priority: [] },
      handoff: { preset: "balanced", required: [], any_of: [] },
      skills: [],
    };
    onChange(category, { ...base, ...partial });
  };

  const hasClassifyConfig = !!(intentConfig?.classifyDescription || intentConfig?.classifyExamples?.length || intentConfig?.classifyBoundaryNotes);

  return (
    <div className="border border-zinc-200 rounded-md overflow-hidden">
      {/* Header with enable toggle */}
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50">
        <span className="flex-1 text-xs font-medium text-zinc-700 font-mono">{meta?.label ?? category}</span>
        {label && <span className="text-[10px] text-zinc-400">{label}</span>}
        <button
          onClick={() => update({ enabled: !enabled })}
          className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${enabled ? "bg-blue-500" : "bg-zinc-200"}`}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {enabled && (
        <div className="px-3 py-3 space-y-3">
          {/* NL Instruction */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-600 mb-1">振る舞い指示</label>
            <textarea
              value={nlInstruction}
              onChange={e => update({ nlInstruction: e.target.value })}
              placeholder={`例: ${meta?.label ?? category}の問い合わせは丁寧に対応し、解決策が見つからない場合は早めに担当者に引き継ぐ`}
              rows={3}
              className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-2 resize-y leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
            />
          </div>

          {/* Classify config (collapsible) */}
          <div>
            <button
              onClick={() => setClassifyOpen(o => !o)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 w-full text-left"
            >
              {classifyOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="font-medium">分類設定</span>
              {hasClassifyConfig && (
                <span className="ml-auto text-[10px] text-green-600 font-medium">✓ 設定済み</span>
              )}
            </button>

            {classifyOpen && (
              <div className="mt-2 space-y-2.5 pl-3 border-l border-zinc-100">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">カテゴリ説明</label>
                  <textarea
                    value={classifyDescription}
                    onChange={e => update({ classifyDescription: e.target.value })}
                    placeholder="このカテゴリはどんな問い合わせか（LLMが分類に使用します）"
                    rows={2}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-none leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">発話例（1行1例）</label>
                  <textarea
                    value={classifyExamples.join("\n")}
                    onChange={e => update({ classifyExamples: e.target.value.split("\n").filter(Boolean) })}
                    placeholder={`例:\n${meta?.label ?? category}について教えてほしい\nどうやって使えばいいですか`}
                    rows={3}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-y leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">分類優先度</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={classifyPriority}
                    onChange={e => update({ classifyPriority: Number(e.target.value) })}
                    className="w-16 text-[11px] text-zinc-800 border border-zinc-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                  <span className="text-[10px] text-zinc-400 ml-2">1〜10（大きいほど優先）</span>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">境界判定メモ</label>
                  <textarea
                    value={classifyBoundaryNotes}
                    onChange={e => update({ classifyBoundaryNotes: e.target.value })}
                    placeholder="他カテゴリとの区別・境界ケースの判定方針"
                    rows={2}
                    className="w-full text-[11px] text-zinc-800 border border-zinc-200 rounded px-2.5 py-1.5 resize-none leading-relaxed placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  config: IntentsConfigJson;
  onChange: (config: IntentsConfigJson) => void;
}

export function IntentConfigEditor({ config, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleCategoryChange = (category: string, catConfig: IntentCategoryConfig) => {
    onChange({ ...config, intents: { ...config.intents, [category]: catConfig } });
  };

  const configuredCount = Object.keys(config.intents).filter(k =>
    config.intents[k]?.nlInstruction || config.intents[k]?.classifyDescription
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-zinc-500 leading-snug">
          カテゴリごとの振る舞い指示と分類設定を記述します。
        </p>
        {configuredCount > 0 && (
          <span className="text-[10px] text-blue-600 font-medium shrink-0 ml-2">{configuredCount}件設定済み</span>
        )}
      </div>

      {SORTED_CATEGORIES.map(category => {
        const isOpen = expanded === category;
        const intentConfig = config.intents[category];
        const hasContent = !!(intentConfig?.nlInstruction || intentConfig?.classifyDescription);
        const isDisabled = intentConfig?.enabled === false;
        return (
          <div key={category}>
            <button
              onClick={() => setExpanded(isOpen ? null : category)}
              className="w-full flex items-center gap-1.5 py-1.5 text-left"
            >
              {isOpen ? <ChevronDown size={12} className="text-zinc-500" /> : <ChevronRight size={12} className="text-zinc-400" />}
              <span className={`text-xs ${isDisabled ? "text-zinc-400 line-through" : "text-zinc-700"}`}>
                {INTENT_META[category]?.label ?? category}
              </span>
              {isDisabled && <span className="ml-1 text-[10px] text-zinc-400">無効</span>}
              {hasContent && !isDisabled && (
                <span className="ml-auto text-[10px] text-blue-600 font-medium">✓ 設定済み</span>
              )}
            </button>
            {isOpen && (
              <CategoryEditor
                category={category}
                intentConfig={intentConfig}
                onChange={handleCategoryChange}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
