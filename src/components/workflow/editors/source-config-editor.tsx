"use client";
import type { SourceConfigJson, KnowledgeSource } from "@/lib/workflow-editor-types";
import { SOURCE_LABELS } from "@/lib/workflow-editor-types";

const ALL_SOURCES: KnowledgeSource[] = ["help_center", "notion_faq", "known_issue", "notion_cse"];

interface Props {
  config: SourceConfigJson;
  onChange: (config: SourceConfigJson) => void;
}

export function SourceConfigEditor({ config, onChange }: Props) {
  const toggleAllowed = (source: KnowledgeSource) => {
    const isAllowed = config.allowed.includes(source);
    const newAllowed = isAllowed
      ? config.allowed.filter(s => s !== source)
      : [...config.allowed, source];
    // priority から削除したソースを除外し、追加したソースを末尾に追加
    const newPriority = isAllowed
      ? config.priority.filter(s => s !== source)
      : [...config.priority, source];
    onChange({ ...config, allowed: newAllowed, priority: newPriority });
  };

  const movePriority = (source: KnowledgeSource, direction: -1 | 1) => {
    const idx = config.priority.indexOf(source);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= config.priority.length) return;
    const next = [...config.priority];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange({ ...config, priority: next });
  };

  const allowedPriority = config.priority.filter(s => config.allowed.includes(s));

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-zinc-500 leading-snug">
        使用するナレッジソースの許可/禁止と優先順序を設定します。
      </p>

      {/* 許可するソース */}
      <div>
        <p className="text-xs font-medium text-zinc-700 mb-2">許可するソース</p>
        <div className="space-y-1.5">
          {ALL_SOURCES.map(source => {
            const allowed = config.allowed.includes(source);
            return (
              <label key={source} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={allowed}
                  onChange={() => toggleAllowed(source)}
                  className="w-3.5 h-3.5 accent-zinc-700"
                />
                <span className={`text-xs ${allowed ? "text-zinc-800" : "text-zinc-400"}`}>
                  {SOURCE_LABELS[source]}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* 優先順序 */}
      {allowedPriority.length > 1 && (
        <div>
          <p className="text-xs font-medium text-zinc-700 mb-2">優先順序（上が高優先）</p>
          <div className="space-y-1">
            {allowedPriority.map((source, idx) => (
              <div key={source} className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400 w-4 text-right">{idx + 1}.</span>
                <span className="flex-1 text-xs text-zinc-700 bg-zinc-50 border border-zinc-200 rounded px-2 py-1">
                  {SOURCE_LABELS[source]}
                </span>
                <div className="flex flex-col">
                  <button
                    onClick={() => movePriority(source, -1)}
                    disabled={idx === 0}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none px-0.5"
                  >▲</button>
                  <button
                    onClick={() => movePriority(source, 1)}
                    disabled={idx === allowedPriority.length - 1}
                    className="text-zinc-400 hover:text-zinc-700 disabled:opacity-25 leading-none px-0.5"
                  >▼</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
