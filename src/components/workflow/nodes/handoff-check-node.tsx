"use client";
import { Handle, Position } from "@xyflow/react";
import type { HandoffCheckNodeData } from "@/lib/workflow-types";

interface Props { data: HandoffCheckNodeData; selected?: boolean }

export function HandoffCheckNode({ data, selected }: Props) {
  return (
    <div
      className={`flex items-center justify-center transition-shadow ${selected ? "drop-shadow-[0_0_0_2px_#60a5fa]" : ""}`}
      style={{ width: 120, height: 60 }}
    >
      {/* Diamond shape */}
      <div
        className="absolute bg-amber-50 border-2 border-amber-300"
        style={{ width: 80, height: 80, transform: "rotate(45deg)", borderRadius: 8 }}
      />
      <span className="relative text-[10px] font-semibold text-amber-800 text-center leading-tight z-10 px-1">
        ハンドオフ<br />判定
      </span>
      <Handle type="target" position={Position.Left} style={{ top: "50%" }} />
      <Handle type="source" position={Position.Right} id="resolve" style={{ top: "30%" }} />
      <Handle type="source" position={Position.Right} id="handoff" style={{ top: "70%" }} />
    </div>
  );
}
