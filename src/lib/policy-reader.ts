import fs from "fs";
import path from "path";

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

const GROUP_LABELS: Record<PolicyGroup, string> = {
  behavior:   "行動・トーン",
  handoff:    "Handoff",
  escalation: "Escalation",
  knowledge:  "ナレッジ優先",
  prompts:    "プロンプト",
  skills:     "Skill",
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

function extractTitle(content: string, fallback: string): string {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function extractSummary(content: string): string {
  const lines = content.split("\n");
  let para = "";
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith(">") || line.startsWith("|")) continue;
    if (line.trim() === "") {
      if (para.trim()) return para.trim().slice(0, 200);
      continue;
    }
    para += (para ? " " : "") + line.replace(/[*`_]/g, "").trim();
  }
  return para.trim().slice(0, 200);
}

const POLICY_FILES: Array<{ rel: string; group: PolicyGroup }> = [
  { rel: "ai-support-bot-md/policies/00_mission.md",                group: "behavior"   },
  { rel: "ai-support-bot-md/policies/01_global_behavior.md",        group: "behavior"   },
  { rel: "ai-support-bot-md/policies/02_tone_and_style.md",         group: "behavior"   },
  { rel: "ai-support-bot-md/policies/04_answer_boundaries.md",      group: "behavior"   },
  { rel: "ai-support-bot-md/policies/05_slot_collection_rules.md",  group: "behavior"   },
  { rel: "ai-support-bot-md/policies/03_escalation_policy.md",      group: "escalation" },
  { rel: "ai-support-bot-md/policies/06_handoff_policy.md",         group: "handoff"    },
  { rel: "ai-support-bot-md/knowledge/policies/source_priority.md", group: "knowledge"  },
  { rel: "ai-support-bot-md/prompts/classifier_prompt.md",          group: "prompts"    },
  { rel: "ai-support-bot-md/prompts/slot_extractor_prompt.md",      group: "prompts"    },
  { rel: "ai-support-bot-md/prompts/next_question_prompt.md",       group: "prompts"    },
  { rel: "ai-support-bot-md/skills/README.md",                      group: "skills"     },
];

export function loadPolicies(): PolicyDoc[] {
  const root = process.cwd();
  return POLICY_FILES.map(({ rel, group }) => {
    const abs = path.join(root, rel);
    let content = "";
    let lastModifiedISO = new Date(0).toISOString();
    try {
      content = fs.readFileSync(abs, "utf-8");
      const stat = fs.statSync(abs);
      lastModifiedISO = stat.mtime.toISOString();
    } catch {
      content = "（ファイルが見つかりません）";
    }
    const filename = path.basename(rel, ".md");
    return {
      id: rel.replace(/\W+/g, "_"),
      file: rel,
      title: extractTitle(content, filename),
      summary: extractSummary(content),
      content,
      lastModifiedISO,
      status: "active" as const,
      group,
      groupLabel: GROUP_LABELS[group],
    };
  });
}
