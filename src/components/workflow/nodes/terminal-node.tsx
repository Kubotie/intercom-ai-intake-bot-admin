"use client";
import { Handle, Position } from "@xyflow/react";
import type { TerminalNodeData } from "@/lib/workflow-types";

const STYLE: Record<string, { bg: string; text: string; border: string }> = {
  reply:         { bg: "bg-green-50",  text: "text-green-800",  border: "border-green-200" },
  handoff:       { bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200" },
  next_question: { bg: "bg-blue-50",   text: "text-blue-800",   border: "border-blue-200"  },
  escalation:    { bg: "bg-red-50",    text: "text-red-800",    border: "border-red-200"   },
};

interface Props { data: TerminalNodeData }

export function TerminalNode({ data }: Props) {
  const s = STYLE[data.terminalType] ?? STYLE.reply;
  return (
    <div className={`rounded-full border ${s.border} ${s.bg} px-4 py-2 shadow-sm`}>
      <Handle type="target" position={Position.Left} />
      <span className={`text-[11px] font-semibold ${s.text}`}>{data.label}</span>
    </div>
  );
}
