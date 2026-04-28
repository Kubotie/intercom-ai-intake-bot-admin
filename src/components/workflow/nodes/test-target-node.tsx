"use client";
import { Handle, Position } from "@xyflow/react";
import type { TestTargetNodeData } from "@/lib/workflow-types";
import { TARGET_TYPE_COLORS } from "@/lib/workflow-types";

interface Props { data: TestTargetNodeData; selected?: boolean }

export function TestTargetNode({ data, selected }: Props) {
  const colorClass = TARGET_TYPE_COLORS[data.targetType] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";
  return (
    <div className={`rounded-lg border bg-white shadow-sm w-[200px] transition-shadow ${selected ? "ring-2 ring-blue-400 shadow-md" : ""}`}>
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>
          {data.targetType}
        </span>
        {!data.isActive && (
          <span className="text-[10px] text-zinc-400 font-medium">inactive</span>
        )}
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium text-zinc-800 truncate">{data.targetValue || "—"}</p>
        {data.label && (
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{data.label}</p>
        )}
        {data.conciergeKey && (
          <p className="text-[10px] text-blue-500 truncate mt-1">→ {data.conciergeKey}</p>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
