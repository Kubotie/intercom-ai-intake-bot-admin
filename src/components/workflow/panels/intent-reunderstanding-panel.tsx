"use client";
import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { IntentReunderstandingNodeData } from "@/lib/workflow-types";

interface Props {
  data: IntentReunderstandingNodeData;
  onSave: (updated: IntentReunderstandingNodeData) => void;
  onClose: () => void;
}

export function IntentReunderstandingPanel({ data, onSave, onClose }: Props) {
  const [label,    setLabel]    = useState(data.label ?? "");
  const [maxTurns, setMaxTurns] = useState(data.maxTurns ?? 3);

  const handleSave = () => {
    onSave({ label, maxTurns });
  };

  return (
    <div className="absolute top-4 right-4 w-72 bg-white rounded-xl shadow-xl border border-zinc-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-violet-500" />
          <span className="text-sm font-semibold text-zinc-800">再インテント理解 設定</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1.5">
            ノードの説明
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="例: フォローアップ発話を再分類"
            className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1.5">
            最大ターン数
          </label>
          <p className="text-[11px] text-zinc-400 mb-2">
            この回数を超えた場合は担当者へ自動エスカレーション
          </p>
          <input
            type="number"
            min={1}
            max={10}
            value={maxTurns}
            onChange={e => setMaxTurns(Number(e.target.value))}
            className="w-20 text-sm px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        </div>
      </div>

      <div className="px-4 py-3 border-t border-zinc-100 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-zinc-600 border border-zinc-200 rounded-md hover:bg-zinc-50"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-violet-500 text-white rounded-md hover:bg-violet-600"
        >
          保存
        </button>
      </div>
    </div>
  );
}
