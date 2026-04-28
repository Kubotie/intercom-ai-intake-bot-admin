"use client";
import { useState } from "react";
import { GitBranch, X } from "lucide-react";
import type { DecisionNodeData } from "@/lib/workflow-types";

interface Props {
  data: DecisionNodeData;
  onSave: (updated: DecisionNodeData) => void;
  onClose: () => void;
}

const ALL_OUTPUTS = ["reply", "escalate", "investigate"] as const;

const OUTPUT_LABELS: Record<string, string> = {
  reply:       "顧客に返答",
  escalate:    "エスカレーション（担当者へ）",
  investigate: "さらに情報収集",
};

export function DecisionPanel({ data, onSave, onClose }: Props) {
  const [description, setDescription] = useState(data.description ?? "");
  const [outputs, setOutputs] = useState<string[]>(
    data.outputs?.length > 0 ? [...data.outputs] : ["reply", "escalate", "investigate"]
  );

  const toggleOutput = (out: string) => {
    setOutputs(prev =>
      prev.includes(out) ? prev.filter(o => o !== out) : [...prev, out]
    );
  };

  const handleSave = () => {
    onSave({
      description,
      outputs: outputs as DecisionNodeData["outputs"],
    });
  };

  return (
    <div className="absolute top-4 right-4 w-80 bg-white rounded-xl shadow-xl border border-zinc-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-orange-500" />
          <span className="text-sm font-semibold text-zinc-800">判断ノード設定</span>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Description */}
        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-1.5">
            判断条件（自然言語）
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            placeholder="例: スキルが回答できた場合は顧客に返答。スロットが揃っている場合は担当者へ引き継ぎ。それ以外はさらに情報収集を続ける。"
            className="w-full text-sm px-3 py-2 rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none leading-relaxed"
          />
        </div>

        {/* Output ports */}
        <div>
          <label className="text-xs font-medium text-zinc-600 block mb-2">
            出力ポート
          </label>
          <div className="space-y-2">
            {ALL_OUTPUTS.map(out => (
              <label key={out} className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={outputs.includes(out)}
                  onChange={() => toggleOutput(out)}
                  className="rounded border-zinc-300 text-orange-500 focus:ring-orange-300"
                />
                <span className="text-sm text-zinc-700">{OUTPUT_LABELS[out]}</span>
              </label>
            ))}
          </div>
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
          className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded-md hover:bg-orange-600"
        >
          保存
        </button>
      </div>
    </div>
  );
}
