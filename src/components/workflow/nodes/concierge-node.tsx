"use client";
import { Handle, Position } from "@xyflow/react";
import type { ConciergeNodeData } from "@/lib/workflow-types";

// One-line summaries for each profile key
const SKILL_SUMMARY: Record<string, string> = {
  default:               "デフォルト順",
  faq_first:             "FAQ → HC",
  help_center_first:     "HC → FAQ",
  known_bug_first:       "既知バグ → FAQ",
  experience_specialist: "体験特化 (閾値緩)",
};

const SOURCE_SUMMARY: Record<string, string> = {
  default:           "HC + FAQ + 既知バグ",
  help_center_first: "HC 優先",
  faq_first:         "FAQ 優先",
  internal_heavy:    "FAQ + CSE + HC",
  safe_public_only:  "HC のみ",
  premium_safe:      "HC + FAQ",
};

const POLICY_SUMMARY: Record<string, string> = {
  default_support:    "標準",
  careful_escalation: "エスカレ慎重",
  self_serve_first:   "セルフ優先",
  premium_high_touch: "ハンドオフ早め",
};

interface Props { data: ConciergeNodeData; selected?: boolean }

export function ConciergeNode({ data, selected }: Props) {
  return (
    <div className={`rounded-lg border border-blue-200 bg-blue-50 shadow-sm w-[220px] transition-shadow ${selected ? "ring-2 ring-blue-400 shadow-md" : ""}`}>
      <Handle type="target" position={Position.Left} />

      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-200 flex items-center gap-2">
        <span className="text-[11px] font-bold text-zinc-800 truncate flex-1">{data.displayName}</span>
        {data.isMain && (
          <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold shrink-0">main</span>
        )}
        {data.isTestOnly && (
          <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold shrink-0">test</span>
        )}
      </div>

      {/* Profile rows */}
      <div className="px-3 py-2 space-y-1">
        <ProfileRow
          label="policy"
          keyVal={data.policySetKey}
          summary={POLICY_SUMMARY[data.policySetKey ?? ""] ?? null}
        />
        <ProfileRow
          label="skill"
          keyVal={data.skillProfileKey}
          summary={SKILL_SUMMARY[data.skillProfileKey ?? ""] ?? null}
        />
        <ProfileRow
          label="source"
          keyVal={data.sourcePriorityProfileKey}
          summary={SOURCE_SUMMARY[data.sourcePriorityProfileKey ?? ""] ?? null}
        />
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function ProfileRow({
  label, keyVal, summary,
}: {
  label: string;
  keyVal: string | null;
  summary: string | null;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-400 w-11 shrink-0">{label}</span>
      <span className="text-[10px] text-zinc-500 truncate">{keyVal ?? "default"}</span>
      {summary && (
        <span className="text-[10px] text-zinc-400 shrink-0">({summary})</span>
      )}
    </div>
  );
}
