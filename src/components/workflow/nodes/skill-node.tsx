"use client";
import { Handle, Position } from "@xyflow/react";
import type { SkillNodeData } from "@/lib/workflow-types";

interface Props { data: SkillNodeData; selected?: boolean }

export function SkillNode({ data, selected }: Props) {
  return (
    <div className={`rounded-lg border border-purple-200 bg-purple-50 shadow-sm w-[180px] transition-shadow ${selected ? "ring-2 ring-purple-400 shadow-md" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-bold text-purple-800 truncate">{data.skillLabel}</span>
          <span className="text-[10px] text-purple-500 shrink-0">{(data.confidenceThreshold * 100).toFixed(0)}%</span>
        </div>
        <p className="text-[10px] text-purple-600 mt-0.5 leading-tight">{data.skillDesc}</p>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
