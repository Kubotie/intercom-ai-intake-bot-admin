"use client";
import { ALL_TOOLS, TOOL_META, type AvailableTool, type IntentsConfigJson } from "@/lib/workflow-editor-types";

interface Props {
  config: IntentsConfigJson;
  conciergeKeys: string[];
  onChange: (config: IntentsConfigJson) => void;
}

export function ConciergeToolsEditor({ config, conciergeKeys, onChange }: Props) {
  const conciergeTools = config.concierge_tools ?? {};

  const toggle = (conciergeKey: string, tool: AvailableTool) => {
    const current = conciergeTools[conciergeKey] ?? [];
    const next = current.includes(tool)
      ? current.filter(t => t !== tool)
      : [...current, tool];
    onChange({
      ...config,
      concierge_tools: { ...conciergeTools, [conciergeKey]: next },
    });
  };

  const isEnabled = (conciergeKey: string, tool: AvailableTool) =>
    (conciergeTools[conciergeKey] ?? []).includes(tool);

  if (conciergeKeys.length === 0) {
    return (
      <p className="text-[11px] text-zinc-400 py-2">
        コンシェルジュが登録されていません。NocoDB にコンシェルジュを追加してください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500 leading-snug">
        コンシェルジュごとに使用できるツール（拡張能力）を設定します。
        ツールは次質問生成の前に実行され、LLMのコンテキストに追加されます。
      </p>

      {/* Tool legend */}
      <div className="space-y-1.5">
        {ALL_TOOLS.map(tool => (
          <div key={tool} className="flex gap-2 px-2 py-1.5 bg-zinc-50 rounded border border-zinc-100">
            <span className="text-[11px] font-medium text-zinc-700 w-28 shrink-0">{TOOL_META[tool].label}</span>
            <span className="text-[10px] text-zinc-400 leading-snug">{TOOL_META[tool].desc}</span>
          </div>
        ))}
      </div>

      {/* Per-concierge checkboxes */}
      <div className="space-y-2">
        {conciergeKeys.map(key => {
          const enabledCount = (conciergeTools[key] ?? []).length;
          return (
            <div key={key} className="border border-zinc-200 rounded-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50">
                <span className="flex-1 text-xs font-medium text-zinc-700 font-mono">{key}</span>
                {enabledCount > 0 && (
                  <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
                    {enabledCount}ツール有効
                  </span>
                )}
              </div>
              <div className="px-3 py-2 flex flex-wrap gap-2">
                {ALL_TOOLS.map(tool => {
                  const on = isEnabled(key, tool);
                  return (
                    <button
                      key={tool}
                      onClick={() => toggle(key, tool)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                        on
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${on ? "bg-white" : "bg-zinc-300"}`} />
                      {TOOL_META[tool].label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
