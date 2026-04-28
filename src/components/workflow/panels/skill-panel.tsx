"use client";
import { useState } from "react";
import type { SkillNodeData } from "@/lib/workflow-types";

interface Props {
  data: SkillNodeData;
  onClose: () => void;
  effectiveThreshold: number;
  onThresholdChange?: (threshold: number) => void;
}

export function SkillPanel({ data, onClose, effectiveThreshold, onThresholdChange }: Props) {
  const [local, setLocal] = useState(effectiveThreshold);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-purple-800 text-sm">{data.skillLabel}</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">{data.skillName}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-zinc-600">{data.skillDesc}</p>

      <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-purple-700">信頼スコア閾値</p>
          <span className="text-sm font-bold text-purple-800 tabular-nums">{(local * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={0.3} max={1.0} step={0.05}
          value={local}
          onChange={e => setLocal(Number(e.target.value))}
          className="w-full accent-purple-500"
        />
        <div className="flex justify-between text-[10px] text-zinc-400">
          <span>30%（緩め）</span>
          <span>100%（厳格）</span>
        </div>
        {onThresholdChange ? (
          <button
            onClick={() => onThresholdChange(local)}
            className="w-full px-3 py-1.5 text-xs bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
          >
            適用
          </button>
        ) : (
          <p className="text-[10px] text-zinc-400 text-center">ワークフローを選択すると編集できます</p>
        )}
      </div>

      <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-100">
        カテゴリ: <span className="font-medium">{data.category}</span>
        &nbsp;·&nbsp;順序: <span className="font-medium">#{data.orderIndex + 1}</span>
      </div>
    </div>
  );
}
