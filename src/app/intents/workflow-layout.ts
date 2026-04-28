import type { Concierge, TestTarget } from "@/lib/nocodb";
import {
  INTENT_META,
  SORTED_CATEGORIES,
  SKILL_LABELS,
  SKILL_THRESHOLDS,
  type WorkflowNode,
  type WorkflowEdge,
} from "./workflow-types";
import {
  REQUIRED_SLOT_NAMES_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
  HANDOFF_MIN_CONDITION_BY_CATEGORY,
} from "@/lib/bot/categories.js";

// ── Column x-positions ────────────────────────────────────────────────────────

const COL = {
  testTarget:   20,
  concierge:    260,
  entry:        500,
  intent:       720,
  skill:        980,
  handoff:      1240,
  terminal:     1500,
} as const;

const ROW_H   = 190;   // px between rows
const START_Y =  60;   // first row y offset

// ── Skill-enabled categories ──────────────────────────────────────────────────

const SKILL_CATEGORIES = new Set(
  Object.entries(INTENT_META)
    .filter(([, m]) => m.skills.length > 0)
    .map(([k]) => k)
);

// ── Main export ───────────────────────────────────────────────────────────────

export function buildInitialLayout(
  concierges: Concierge[],
  testTargets: TestTarget[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // ── Entry node ────────────────────────────────────────────────────────────

  const entryId = "entry";
  nodes.push({
    id: entryId,
    type: "entry",
    position: { x: COL.entry, y: START_Y + ROW_H * 3 },
    data: {},
  });

  // ── TestTarget nodes ──────────────────────────────────────────────────────

  testTargets.forEach((tt, i) => {
    const id = `testTarget-${tt.Id}`;
    nodes.push({
      id,
      type: "testTarget",
      position: { x: COL.testTarget, y: START_Y + ROW_H * i },
      data: {
        targetId:    tt.Id,
        targetType:  tt.target_type ?? "",
        targetValue: tt.target_value ?? "",
        label:       tt.label ?? null,
        conciergeKey: tt.concierge_key ?? null,
        isActive:    tt.is_active ?? true,
      },
    });

    // Edge: testTarget → concierge (if concierge_key matched)
    const matchedConcierge = concierges.find(
      (c) => c.concierge_key === tt.concierge_key
    );
    if (matchedConcierge) {
      edges.push({
        id:     `e-${id}-concierge-${matchedConcierge.Id}`,
        source: id,
        target: `concierge-${matchedConcierge.Id}`,
        style:  { strokeDasharray: "4 2", stroke: "#94a3b8" },
      });
    } else {
      // Falls back to main concierge
      const main = concierges.find((c) => c.is_main);
      if (main) {
        edges.push({
          id:     `e-${id}-concierge-${main.Id}`,
          source: id,
          target: `concierge-${main.Id}`,
          style:  { strokeDasharray: "4 2", stroke: "#94a3b8" },
        });
      }
    }
  });

  // ── Concierge nodes ───────────────────────────────────────────────────────

  concierges.forEach((c, i) => {
    const id = `concierge-${c.Id}`;
    nodes.push({
      id,
      type: "concierge",
      position: { x: COL.concierge, y: START_Y + ROW_H * i },
      data: {
        conciergeId:               c.Id,
        conciergeKey:              c.concierge_key,
        displayName:               c.display_name,
        personaLabel:              c.persona_label ?? null,
        policySetKey:              c.policy_set_key ?? null,
        skillProfileKey:           c.skill_profile_key ?? null,
        sourcePriorityProfileKey:  c.source_priority_profile_key ?? null,
        isMain:                    c.is_main ?? false,
        isActive:                  c.is_active ?? true,
        isTestOnly:                c.is_test_only ?? false,
      },
    });

    // Edge: concierge → entry
    edges.push({
      id:     `e-${id}-entry`,
      source: id,
      target: entryId,
      style:  { stroke: "#64748b" },
    });
  });

  // ── Intent nodes + downstream ─────────────────────────────────────────────

  SORTED_CATEGORIES.forEach((category, i) => {
    const meta  = INTENT_META[category];
    const y     = START_Y + ROW_H * i;
    const intentId = `intent-${category}`;

    // IntentNode
    const handoffCond = (HANDOFF_MIN_CONDITION_BY_CATEGORY as Record<string, { required: string[]; any_of: string[][] }>)[category];
    nodes.push({
      id:   intentId,
      type: "intent",
      position: { x: COL.intent, y },
      data: {
        category,
        meta,
        requiredSlots:   (REQUIRED_SLOT_NAMES_BY_CATEGORY as Record<string, string[]>)[category] ?? [],
        slotPriority:    (SLOT_PRIORITY_BY_CATEGORY as Record<string, string[]>)[category] ?? [],
        handoffRequired: handoffCond?.required ?? [],
        handoffAnyOf:    handoffCond?.any_of ?? [],
      },
    });

    // Edge: entry → intent
    edges.push({
      id:     `e-entry-${intentId}`,
      source: entryId,
      target: intentId,
      label:  meta.label,
      style:  { stroke: "#94a3b8" },
    });

    if (SKILL_CATEGORIES.has(category)) {
      // Skill nodes
      const skillIds: string[] = [];
      meta.skills.forEach((skillName, si) => {
        const skillId = `skill-${category}-${skillName}`;
        skillIds.push(skillId);
        nodes.push({
          id:   skillId,
          type: "skill",
          position: { x: COL.skill, y: y + si * 70 },
          data: {
            skillName,
            skillLabel:          SKILL_LABELS[skillName] ?? skillName,
            skillDesc:           meta.skillDescriptions[si] ?? "",
            category,
            orderIndex:          si,
            confidenceThreshold: SKILL_THRESHOLDS[skillName] ?? 0.65,
          },
        });

        const prevSkillId = si > 0 ? skillIds[si - 1] : undefined;
        edges.push({
          id:     `e-${prevSkillId ?? intentId}-${skillId}`,
          source: prevSkillId ?? intentId,
          target: skillId,
          style:  { stroke: "#8b5cf6" },
        });
      });

      // HandoffCheck node
      const handoffId = `handoff-${category}`;
      nodes.push({
        id:   handoffId,
        type: "handoffCheck",
        position: { x: COL.handoff, y },
        data: {
          category,
          handoffRequired: handoffCond?.required ?? [],
          handoffAnyOf:    handoffCond?.any_of ?? [],
          handoffDesc:     `${meta.label} ハンドオフ条件`,
        },
      });

      // Last skill → handoff
      const lastSkillId = skillIds[skillIds.length - 1];
      edges.push({
        id:     `e-${lastSkillId}-${handoffId}`,
        source: lastSkillId,
        target: handoffId,
        label:  "スキル完了",
        style:  { stroke: "#8b5cf6" },
      });

      // HandoffCheck → reply terminal
      const replyTermId = `terminal-reply-${category}`;
      nodes.push({
        id:   replyTermId,
        type: "terminal",
        position: { x: COL.terminal, y: y - 40 },
        data: { terminalType: "reply", label: "AI返答" },
      });
      edges.push({
        id:     `e-${handoffId}-${replyTermId}`,
        source: handoffId,
        target: replyTermId,
        label:  "解決",
        style:  { stroke: "#22c55e" },
      });

      // HandoffCheck → handoff terminal
      const handoffTermId = `terminal-handoff-${category}`;
      nodes.push({
        id:   handoffTermId,
        type: "terminal",
        position: { x: COL.terminal, y: y + 60 },
        data: { terminalType: "handoff", label: "担当者引き継ぎ" },
      });
      edges.push({
        id:     `e-${handoffId}-${handoffTermId}`,
        source: handoffId,
        target: handoffTermId,
        label:  "引き継ぎ",
        style:  { stroke: "#f59e0b" },
      });

    } else {
      // No-skill: intent → next_question / handoff directly
      const nextQId  = `terminal-nextq-${category}`;
      const handoffTermId = `terminal-handoff-${category}`;

      nodes.push({
        id:   nextQId,
        type: "terminal",
        position: { x: COL.skill, y: y - 30 },
        data: { terminalType: "next_question", label: "スロット収集" },
      });
      nodes.push({
        id:   handoffTermId,
        type: "terminal",
        position: { x: COL.skill, y: y + 50 },
        data: { terminalType: "handoff", label: "担当者引き継ぎ" },
      });

      edges.push({
        id:     `e-${intentId}-${nextQId}`,
        source: intentId,
        target: nextQId,
        label:  "収集中",
        style:  { stroke: "#64748b" },
      });
      edges.push({
        id:     `e-${intentId}-${handoffTermId}`,
        source: intentId,
        target: handoffTermId,
        label:  "条件充足",
        style:  { stroke: "#f59e0b" },
      });
    }
  });

  // Escalation terminal (shared)
  nodes.push({
    id:   "terminal-escalation",
    type: "terminal",
    position: { x: COL.terminal, y: START_Y + ROW_H * SORTED_CATEGORIES.length },
    data: { terminalType: "escalation", label: "エスカレーション" },
  });
  edges.push({
    id:     "e-entry-escalation",
    source: entryId,
    target: "terminal-escalation",
    label:  "高リスク",
    style:  { stroke: "#ef4444" },
  });

  return { nodes, edges };
}
