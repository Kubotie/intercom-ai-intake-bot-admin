import type { WorkflowRunResult } from "./workflow-run-result";
import type { Concierge } from "@/lib/nocodb";
import { INTENT_META } from "./workflow-types";

export type HighlightSet = {
  activeNodes:   Set<string>;  // all visited nodes on the path
  acceptedNodes: Set<string>;  // skill accepted, terminal reached
  triedNodes:    Set<string>;  // skill tried but rejected
  activeEdges:   Set<string>;  // edges on the active path
};

const SKILL_CATEGORIES = new Set(
  Object.entries(INTENT_META)
    .filter(([, m]) => m.skills.length > 0)
    .map(([k]) => k)
);

export function computeHighlights(
  result: WorkflowRunResult,
  concierges: Concierge[],
): HighlightSet {
  const active   = new Set<string>();
  const accepted = new Set<string>();
  const tried    = new Set<string>();
  const edges    = new Set<string>();

  // Entry node is always on path
  active.add("entry");

  // Concierge node (match by key → resolve Id)
  const concierge = concierges.find((c) => c.concierge_key === result.conciergeKey);
  if (concierge) {
    const cid = `concierge-${concierge.Id}`;
    active.add(cid);
    accepted.add(cid);
    edges.add(`e-${cid}-entry`);
  }

  // Escalation short-circuits everything
  if (result.isEscalation) {
    active.add("terminal-escalation");
    accepted.add("terminal-escalation");
    edges.add("e-entry-escalation");
    return { activeNodes: active, acceptedNodes: accepted, triedNodes: tried, activeEdges: edges };
  }

  const category = result.category;
  if (!category) {
    return { activeNodes: active, acceptedNodes: accepted, triedNodes: tried, activeEdges: edges };
  }

  // Intent node
  const intentId = `intent-${category}`;
  active.add(intentId);
  accepted.add(intentId);
  edges.add(`e-entry-${intentId}`);

  if (SKILL_CATEGORIES.has(category) && result.triedSkills.length > 0) {
    // Skill chain
    let prevId = intentId;
    for (const s of result.triedSkills) {
      const skillId = `skill-${category}-${s.skillName}`;
      active.add(skillId);
      edges.add(`e-${prevId}-${skillId}`);
      if (s.accepted) {
        accepted.add(skillId);
      } else {
        tried.add(skillId);
      }
      prevId = skillId;
    }

    // HandoffCheck
    const handoffId = `handoff-${category}`;
    active.add(handoffId);
    accepted.add(handoffId);
    edges.add(`e-${prevId}-${handoffId}`);

    // Terminal
    const termId = result.isHandoff
      ? `terminal-handoff-${category}`
      : `terminal-reply-${category}`;
    active.add(termId);
    accepted.add(termId);
    edges.add(`e-${handoffId}-${termId}`);

  } else {
    // No-skill category — direct terminal from intent
    const termId = result.isHandoff
      ? `terminal-handoff-${category}`
      : `terminal-nextq-${category}`;
    active.add(termId);
    accepted.add(termId);
    edges.add(`e-${intentId}-${termId}`);
  }

  return { activeNodes: active, acceptedNodes: accepted, triedNodes: tried, activeEdges: edges };
}

// Apply highlight styles to ReactFlow node/edge data
export function applyNodeHighlights<T extends { id: string; style?: React.CSSProperties }>(
  nodes: T[],
  hl: HighlightSet,
): T[] {
  return nodes.map((n) => {
    if (hl.triedNodes.has(n.id)) {
      return { ...n, style: { ...n.style, boxShadow: "0 0 0 2px #f59e0b, 0 0 10px rgba(245,158,11,0.35)", zIndex: 2, opacity: 1 } };
    }
    if (hl.acceptedNodes.has(n.id)) {
      return { ...n, style: { ...n.style, boxShadow: "0 0 0 2.5px #3b82f6, 0 0 14px rgba(59,130,246,0.4)", zIndex: 2, opacity: 1 } };
    }
    if (hl.activeNodes.has(n.id)) {
      return { ...n, style: { ...n.style, boxShadow: "0 0 0 2px #94a3b8, 0 0 8px rgba(148,163,184,0.3)", zIndex: 1, opacity: 1 } };
    }
    // Not on path — fade
    return { ...n, style: { ...n.style, opacity: 0.3, boxShadow: undefined, zIndex: 0 } };
  });
}

export function applyEdgeHighlights<T extends { id: string; style?: React.CSSProperties; animated?: boolean }>(
  edges: T[],
  hl: HighlightSet,
): T[] {
  return edges.map((e) => {
    if (hl.activeEdges.has(e.id)) {
      return { ...e, animated: true, style: { ...e.style, stroke: "#3b82f6", strokeWidth: 2.5, opacity: 1 } };
    }
    return { ...e, animated: false, style: { ...e.style, stroke: "#e2e8f0", strokeWidth: 1, opacity: 0.4 } };
  });
}
