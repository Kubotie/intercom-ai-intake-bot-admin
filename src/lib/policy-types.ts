export type PolicyGroup = "behavior" | "handoff" | "escalation" | "knowledge" | "prompts" | "skills";

export type PolicyDoc = {
  id: string;
  file: string;
  title: string;
  summary: string;
  content: string;
  lastModifiedISO: string;
  status: "active" | "draft";
  group: PolicyGroup;
  groupLabel: string;
};

const GROUP_COLORS: Record<PolicyGroup, string> = {
  behavior:   "bg-blue-50 text-blue-700 border-blue-200",
  handoff:    "bg-amber-50 text-amber-700 border-amber-200",
  escalation: "bg-red-50 text-red-700 border-red-200",
  knowledge:  "bg-purple-50 text-purple-700 border-purple-200",
  prompts:    "bg-zinc-50 text-zinc-600 border-zinc-200",
  skills:     "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function groupColor(group: PolicyGroup): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.prompts;
}
