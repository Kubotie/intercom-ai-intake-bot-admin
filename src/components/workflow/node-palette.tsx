"use client";
import { GitBranch, RefreshCw } from "lucide-react";

type PaletteItem = {
  type: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  border: string;
};

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type:   "decision",
    label:  "判断ノード",
    desc:   "自然言語で判断条件を記述",
    icon:   GitBranch,
    color:  "text-orange-600",
    border: "border-orange-200 bg-orange-50 hover:bg-orange-100",
  },
  {
    type:   "intentReunderstanding",
    label:  "再インテント理解",
    desc:   "フォローアップ発話を再分類",
    icon:   RefreshCw,
    color:  "text-violet-600",
    border: "border-violet-200 bg-violet-50 hover:bg-violet-100",
  },
];

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData("application/reactflow-nodetype", nodeType);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white rounded-xl shadow-lg border border-zinc-200 p-3 space-y-2 w-[160px]"
      style={{ userSelect: "none" }}
    >
      <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide px-1 pb-1">
        ノードを追加
      </p>
      {PALETTE_ITEMS.map(({ type, label, desc, icon: Icon, color, border }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          className={`flex items-start gap-2 px-2 py-2 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${border}`}
        >
          <Icon size={14} className={`${color} mt-0.5 shrink-0`} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-zinc-700 leading-tight">{label}</p>
            <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
