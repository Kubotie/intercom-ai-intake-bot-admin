"use client";
import type { NodeProps } from "@xyflow/react";

type SectionHeaderData = {
  title: string;
  subtitle?: string;
  kind: "routing" | "flow";
};

const STYLE = {
  routing: {
    wrapper: "border-slate-300 bg-slate-50",
    title:   "text-slate-700",
    sub:     "text-slate-500",
    icon:    "⇄",
  },
  flow: {
    wrapper: "border-zinc-300 bg-zinc-100/80",
    title:   "text-zinc-500",
    sub:     "text-zinc-400",
    icon:    "↻",
  },
};

export function SectionHeaderNode({ data }: NodeProps) {
  const d = data as SectionHeaderData;
  const s = STYLE[d.kind ?? "flow"];
  return (
    <div
      className={`px-4 py-2.5 rounded-xl border-2 border-dashed ${s.wrapper} pointer-events-none select-none`}
    >
      <p className={`text-sm font-bold ${s.title} flex items-center gap-1.5 leading-tight`}>
        <span className="text-base">{s.icon}</span>
        {d.title}
      </p>
      {d.subtitle && (
        <p className={`text-[11px] ${s.sub} mt-1 leading-snug max-w-[560px]`}>{d.subtitle}</p>
      )}
    </div>
  );
}
