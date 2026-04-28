"use client";
import { Handle, Position } from "@xyflow/react";
import { GitBranch } from "lucide-react";
import type { DecisionNodeData } from "@/lib/workflow-types";

interface Props { data: DecisionNodeData; selected?: boolean }

const OUTPUT_LABELS: Record<string, { label: string; color: string; top: string }> = {
  reply:       { label: "顧客に返答",       color: "#22c55e", top: "25%" },
  escalate:    { label: "エスカレーション", color: "#ef4444", top: "50%" },
  investigate: { label: "さらに調査",       color: "#f59e0b", top: "75%" },
};

export function DecisionNode({ data, selected }: Props) {
  const outputs = data.outputs?.length > 0
    ? data.outputs
    : ["reply", "escalate", "investigate"] as const;

  return (
    <div
      className={`rounded-lg border border-orange-200 bg-orange-50 shadow-sm w-[220px] transition-shadow ${
        selected ? "ring-2 ring-orange-400 shadow-md" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="px-3 py-2 border-b border-orange-200 flex items-center gap-2">
        <GitBranch size={12} className="text-orange-600 shrink-0" />
        <span className="text-[11px] font-bold text-orange-800">判断ノード</span>
      </div>
      <div className="px-3 py-2">
        {data.description ? (
          <p className="text-[11px] text-zinc-600 leading-relaxed">{data.description}</p>
        ) : (
          <p className="text-[11px] text-zinc-400 italic leading-relaxed">
            判断条件を自然言語で記述…
          </p>
        )}
        <div className="mt-2 space-y-1">
          {outputs.map((out) => {
            const meta = OUTPUT_LABELS[out];
            if (!meta) return null;
            return (
              <div key={out} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: meta.color }}
                />
                <span className="text-[10px] text-zinc-500">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {outputs.map((out) => {
        const meta = OUTPUT_LABELS[out];
        if (!meta) return null;
        return (
          <Handle
            key={out}
            type="source"
            position={Position.Right}
            id={out}
            style={{ top: meta.top, background: meta.color }}
          />
        );
      })}
    </div>
  );
}
