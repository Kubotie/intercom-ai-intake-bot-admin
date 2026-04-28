"use client";
import { Handle, Position } from "@xyflow/react";
import type { IntentNodeData } from "@/lib/workflow-types";
import { INTENT_COLOR_CLASSES } from "@/lib/workflow-types";

interface Props { data: IntentNodeData; selected?: boolean }

export function IntentNode({ data, selected }: Props) {
  const colors = INTENT_COLOR_CLASSES[data.meta.color] ?? INTENT_COLOR_CLASSES["blue"];
  const displayDesc = (data as IntentNodeData & { naturalLanguageDesc?: string }).naturalLanguageDesc || data.meta.desc;

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} shadow-sm w-[230px] transition-shadow ${selected ? "ring-2 ring-blue-400 shadow-md" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="px-3 py-2 border-b border-inherit flex items-center justify-between">
        <span className={`text-[11px] font-bold ${colors.text}`}>{data.meta.label}</span>
        {data.meta.knowledgeFirst && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-white/60 text-zinc-500 border border-zinc-200">
            知識優先
          </span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-[11px] text-zinc-600 leading-relaxed">{displayDesc}</p>
        {data.meta.representativeUtterances?.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {data.meta.representativeUtterances.slice(0, 2).map((u, i) => (
              <p key={i} className="text-[10px] text-zinc-400 italic truncate">「{u}」</p>
            ))}
          </div>
        )}
        {data.meta.skills.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {data.meta.skills.map((s) => (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded ${colors.badge}`}>{s}</span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
