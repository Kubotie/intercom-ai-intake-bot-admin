"use client";
import { Handle, Position } from "@xyflow/react";
import { RefreshCw } from "lucide-react";
import type { IntentReunderstandingNodeData } from "@/lib/workflow-types";

interface Props { data: IntentReunderstandingNodeData; selected?: boolean }

export function IntentReunderstandingNode({ data, selected }: Props) {
  return (
    <div
      className={`rounded-lg border border-violet-200 bg-violet-50 shadow-sm w-[200px] transition-shadow ${
        selected ? "ring-2 ring-violet-400 shadow-md" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="px-3 py-2 border-b border-violet-200 flex items-center gap-2">
        <RefreshCw size={12} className="text-violet-600 shrink-0" />
        <span className="text-[11px] font-bold text-violet-800">再インテント理解</span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          {data.label || "フォローアップ発話を再分類"}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-400">最大ターン数:</span>
          <span className="text-[10px] font-medium text-violet-700">{data.maxTurns ?? 3}</span>
        </div>
      </div>
      {/* Output goes back to an intent/concierge node — visual loop */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="loop"
        style={{ background: "#8b5cf6" }}
      />
    </div>
  );
}
