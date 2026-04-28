"use client";
import type { TerminalNodeData } from "@/lib/workflow-types";

const TYPE_INFO: Record<string, { label: string; desc: string; badge: string }> = {
  reply:         { label: "AI返答",         desc: "スキルの実行結果を顧客に返信します。スキルが十分な信頼スコアを持つ場合にのみ使用されます。",              badge: "text-green-700 bg-green-50 border-green-200" },
  handoff:       { label: "担当者引き継ぎ",  desc: "収集したスロット情報とともに、担当者へ転送します。ハンドオフ判定ノードで条件を満たした場合に実行されます。",  badge: "text-amber-700 bg-amber-50 border-amber-200" },
  next_question: { label: "スロット収集",    desc: "ハンドオフに必要な情報がまだ揃っていない場合、追加の質問を行って情報収集を続けます。",                   badge: "text-blue-700 bg-blue-50 border-blue-200"   },
  escalation:    { label: "エスカレーション", desc: "高リスクと判定されたケースを即座に担当者へ通知します。通常の引き継ぎフローをスキップします。",              badge: "text-red-700 bg-red-50 border-red-200"      },
};

interface Props {
  data: TerminalNodeData;
  onClose: () => void;
}

export function TerminalPanel({ data, onClose }: Props) {
  const info = TYPE_INFO[data.terminalType] ?? TYPE_INFO.reply;
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${info.badge}`}>
          {info.label}
        </span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">×</button>
      </div>

      <p className="text-xs text-zinc-600 leading-relaxed">{info.desc}</p>

      <div className="pt-1 border-t border-zinc-100">
        <p className="text-[10px] text-zinc-400">
          type: <code className="font-mono bg-zinc-100 px-1 rounded">{data.terminalType}</code>
        </p>
      </div>
    </div>
  );
}
