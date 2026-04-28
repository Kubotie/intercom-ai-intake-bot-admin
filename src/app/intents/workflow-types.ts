import type { Node, Edge } from "@xyflow/react";
import type { Concierge, TestTarget } from "@/lib/nocodb";

// ── Intent metadata ───────────────────────────────────────────────────────────

export type IntentMeta = {
  label: string;
  desc: string;
  representativeUtterances: string[];
  priority: number;
  knowledgeFirst: boolean;
  skills: string[];
  skillDescriptions: string[];
  color: string;  // Tailwind base color name
};

export const INTENT_META: Record<string, IntentMeta> = {
  billing_contract: {
    label: "請求・契約",
    desc: "解約・プラン変更・請求書確認・支払い方法",
    representativeUtterances: ["解約したい", "プラン変更の方法は？", "請求書を確認したい"],
    priority: 1,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に直接引き継ぎ"],
    color: "emerald",
  },
  login_account: {
    label: "ログイン・アカウント",
    desc: "ログイン不可・権限エラー・アカウント招待・パスワード",
    representativeUtterances: ["ログインできない", "パスワードを忘れた", "アカウントにアクセスできない"],
    priority: 2,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に直接引き継ぎ"],
    color: "sky",
  },
  experience_issue: {
    label: "体験・表示・配信問題",
    desc: "体験/ポップアップ/A-Bテスト の表示不具合・配信停止",
    representativeUtterances: ["ABテストが反映されない", "ポップアップが表示されない", "0インプレッション"],
    priority: 3,
    knowledgeFirst: true,
    skills: ["faq_answer", "help_center_answer"],
    skillDescriptions: ["Notion FAQ（最優先）", "Help Center（FAQ fallback）"],
    color: "purple",
  },
  tracking_issue: {
    label: "計測・トラッキング問題",
    desc: "タグ未検出・GTMエラー・ページビュー計測されない",
    representativeUtterances: ["計測できていない", "GTMタグが検出されない"],
    priority: 4,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に引き継ぎ"],
    color: "orange",
  },
  bug_report: {
    label: "機能不具合",
    desc: "明確なエラーメッセージ・操作不能・画面フリーズ",
    representativeUtterances: ["エラーが出て保存できない", "ボタンを押しても反応しない"],
    priority: 5,
    knowledgeFirst: false,
    skills: ["known_bug_match"],
    skillDescriptions: ["既知バグDB（support_ai_known_issues）と照合"],
    color: "red",
  },
  usage_guidance: {
    label: "使い方・設定方法",
    desc: "機能の操作方法・設定箇所の案内・やり方が分からない",
    representativeUtterances: ["ABテストの作り方を教えてほしい", "ヒートマップの見方が分からない"],
    priority: 6,
    knowledgeFirst: true,
    skills: ["help_center_answer", "faq_answer"],
    skillDescriptions: ["Help Center（最優先）", "Notion FAQ（fallback）"],
    color: "blue",
  },
  report_difference: {
    label: "数値差異",
    desc: "GA4・社内集計・Ptengine レポートの数値が合わない",
    representativeUtterances: ["GA4と数値が違う", "コンバージョン数がおかしい"],
    priority: 7,
    knowledgeFirst: false,
    skills: [],
    skillDescriptions: ["（未実装）担当者に引き継ぎ"],
    color: "teal",
  },
};

export const SORTED_CATEGORIES = Object.entries(INTENT_META)
  .sort(([, a], [, b]) => a.priority - b.priority)
  .map(([key]) => key);

// ── Node data shapes ──────────────────────────────────────────────────────────

export type TestTargetNodeData = {
  targetId: number;
  targetType: string;
  targetValue: string;
  label: string | null;
  conciergeKey: string | null;
  isActive: boolean;
};

export type ConciergeNodeData = {
  conciergeId: number;
  conciergeKey: string;
  displayName: string;
  personaLabel: string | null;
  policySetKey: string | null;
  skillProfileKey: string | null;
  sourcePriorityProfileKey: string | null;
  isMain: boolean;
  isActive: boolean;
  isTestOnly: boolean;
};

export type IntentNodeData = {
  category: string;
  meta: IntentMeta;
  requiredSlots: string[];
  slotPriority: string[];
  handoffRequired: string[];
  handoffAnyOf: string[][];
};

export type SkillNodeData = {
  skillName: string;
  skillLabel: string;
  skillDesc: string;
  category: string;
  orderIndex: number;
  confidenceThreshold: number;
};

export type HandoffCheckNodeData = {
  category: string;
  handoffRequired: string[];
  handoffAnyOf: string[][];
  handoffDesc: string;
};

export type TerminalNodeData = {
  terminalType: "reply" | "handoff" | "next_question" | "escalation";
  label: string;
};

export type EntryNodeData = Record<string, never>;

// ── Typed Node aliases ────────────────────────────────────────────────────────

export type TestTargetFlowNode  = Node<TestTargetNodeData, "testTarget">;
export type ConciergeFlowNode   = Node<ConciergeNodeData, "concierge">;
export type IntentFlowNode      = Node<IntentNodeData, "intent">;
export type SkillFlowNode       = Node<SkillNodeData, "skill">;
export type HandoffCheckFlowNode = Node<HandoffCheckNodeData, "handoffCheck">;
export type TerminalFlowNode    = Node<TerminalNodeData, "terminal">;
export type EntryFlowNode       = Node<EntryNodeData, "entry">;

export type WorkflowNode =
  | TestTargetFlowNode
  | ConciergeFlowNode
  | IntentFlowNode
  | SkillFlowNode
  | HandoffCheckFlowNode
  | TerminalFlowNode
  | EntryFlowNode;

export type WorkflowEdge = Edge;

// ── Layout input ──────────────────────────────────────────────────────────────

export type WorkflowData = {
  concierges: Concierge[];
  testTargets: TestTarget[];
};

// ── Skill display names ───────────────────────────────────────────────────────

export const SKILL_LABELS: Record<string, string> = {
  faq_answer:           "FAQ 回答",
  help_center_answer:   "Help Center",
  known_bug_match:      "既知バグ照合",
};

export const SKILL_THRESHOLDS: Record<string, number> = {
  faq_answer:           0.65,
  help_center_answer:   0.65,
  known_bug_match:      0.70,
};

// ── Target type colors ────────────────────────────────────────────────────────

export const TARGET_TYPE_COLORS: Record<string, string> = {
  contact:      "bg-blue-100 text-blue-700 border-blue-200",
  conversation: "bg-purple-100 text-purple-700 border-purple-200",
  email:        "bg-emerald-100 text-emerald-700 border-emerald-200",
  domain:       "bg-orange-100 text-orange-700 border-orange-200",
  company:      "bg-cyan-100 text-cyan-700 border-cyan-200",
  plan:         "bg-rose-100 text-rose-700 border-rose-200",
};

// ── Intent color classes ──────────────────────────────────────────────────────

export const INTENT_COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-100 text-emerald-700" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-200",     text: "text-sky-800",     badge: "bg-sky-100 text-sky-700" },
  purple:  { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-800",  badge: "bg-purple-100 text-purple-700" },
  orange:  { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-800",  badge: "bg-orange-100 text-orange-700" },
  red:     { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-800",     badge: "bg-red-100 text-red-700" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-800",    badge: "bg-blue-100 text-blue-700" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-800",    badge: "bg-teal-100 text-teal-700" },
};
