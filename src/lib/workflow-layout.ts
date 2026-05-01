import type { Concierge, TestTarget } from "@/lib/nocodb";
import {
  INTENT_META,
  SORTED_CATEGORIES,
  SKILL_LABELS,
  SKILL_THRESHOLDS,
  type IntentMeta,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/lib/workflow-types";
import {
  REQUIRED_SLOT_NAMES_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
  HANDOFF_MIN_CONDITION_BY_CATEGORY,
} from "@/lib/bot/categories.js";
import type { IntentsConfigJson } from "@/lib/workflow-editor-types";

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

// ── Main export ───────────────────────────────────────────────────────────────

export function buildInitialLayout(
  concierges: Concierge[],
  testTargets: TestTarget[],
  intentsConfig?: IntentsConfigJson,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // ── Category list: dynamic from intentsConfig, fallback to SORTED_CATEGORIES ─
  //
  // sandbox/processor と同じロジックで構築:
  //   1. テンプレートカテゴリ: intentsConfig に無いか、enabled:false でなければ含める
  //   2. カスタムカテゴリ:    intentsConfig に明示的に存在し enabled:false でなければ含める
  //
  // こうすることで "intents_config_json に書かれていないテンプレートカテゴリ" も
  // キャンバスに存在し、sandbox が分類した結果をハイライトできる。

  const TEMPLATE_CATEGORY_KEYS = Object.keys(INTENT_META); // SORTED_CATEGORIES のキー

  const categories: string[] = (() => {
    if (!intentsConfig?.intents) return SORTED_CATEGORIES;

    const intents = intentsConfig.intents;

    // テンプレートカテゴリ: 明示的に enabled:false にされていなければ含める
    const templateCats = TEMPLATE_CATEGORY_KEYS.filter(k => {
      const cfg = intents[k];
      return !cfg || cfg.enabled !== false;
    });

    // カスタムカテゴリ: intentsConfig に明示的に存在し enabled:false でなければ含める
    const customCats = Object.keys(intents).filter(
      k => !TEMPLATE_CATEGORY_KEYS.includes(k) && intents[k]?.enabled !== false
    );

    return [...templateCats, ...customCats].sort((a, b) => {
      const pa = intents[a]?.classifyPriority ?? INTENT_META[a]?.priority ?? 99;
      const pb = intents[b]?.classifyPriority ?? INTENT_META[b]?.priority ?? 99;
      return pa - pb;
    });
  })();

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

  categories.forEach((category, i) => {
    const baseMeta = INTENT_META[category];
    const configEntry = intentsConfig?.intents[category];

    // カスタムカテゴリ用の合成メタ（INTENT_META にない場合）
    const meta: IntentMeta = baseMeta ?? {
      label: configEntry?.label ?? category,
      desc: "",
      representativeUtterances: [],
      priority: i + 1,
      knowledgeFirst: false,
      skills: [],
      skillDescriptions: [],
      color: "zinc",
    };

    // スキル決定:
    // 1. configEntry.skills が設定されていれば使用（ユーザー設定優先）
    // 2. なければ INTENT_META デフォルト（テンプレートカテゴリのフォールバック）
    const configuredSkillNames = (configEntry?.skills ?? []).map(s => s.name);
    const skillNames = configuredSkillNames.length > 0 ? configuredSkillNames : meta.skills;
    const hasSkills = skillNames.length > 0;

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

    if (hasSkills) {
      // Skill nodes
      const skillIds: string[] = [];
      skillNames.forEach((skillName, si) => {
        const skillId = `skill-${category}-${skillName}`;
        skillIds.push(skillId);

        // 設定済みスキルの threshold を優先、なければデフォルト
        const configuredSkill = (configEntry?.skills ?? []).find(s => s.name === skillName);
        const threshold = configuredSkill?.threshold ?? SKILL_THRESHOLDS[skillName] ?? 0.65;

        // skillDesc: INTENT_META に対応するスキルのインデックスを検索
        const metaSkillIdx = meta.skills.indexOf(skillName);
        const skillDesc = metaSkillIdx >= 0
          ? (meta.skillDescriptions[metaSkillIdx] ?? "")
          : (SKILL_LABELS[skillName] ?? skillName);

        nodes.push({
          id:   skillId,
          type: "skill",
          position: { x: COL.skill, y: y + si * 70 },
          data: {
            skillName,
            skillLabel:          SKILL_LABELS[skillName] ?? skillName,
            skillDesc,
            category,
            orderIndex:          si,
            confidenceThreshold: threshold,
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

  // Escalation terminal (shared) — position uses dynamic categories.length
  nodes.push({
    id:   "terminal-escalation",
    type: "terminal",
    position: { x: COL.terminal, y: START_Y + ROW_H * categories.length },
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
