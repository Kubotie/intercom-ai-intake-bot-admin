import fs from "fs";
import path from "path";
import type { PolicyGroup, PolicyDoc } from "./policy-types";
export type { PolicyGroup, PolicyDoc } from "./policy-types";
export { groupColor } from "./policy-types";

const GROUP_LABELS: Record<PolicyGroup, string> = {
  behavior:   "行動・トーン",
  handoff:    "Handoff",
  escalation: "Escalation",
  knowledge:  "ナレッジ優先",
  prompts:    "プロンプト",
  skills:     "Skill",
};

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

export const POLICY_FILES: Array<{ rel: string; group: PolicyGroup }> = [
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
