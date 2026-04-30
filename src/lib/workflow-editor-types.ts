import type { WorkflowDefinition } from "@/lib/nocodb";

// ── Skill config (v1) ─────────────────────────────────────────────────────────

export type SkillConfigJson = {
  version: 1;
  category_skill_order: Record<string, string[]>;
};

// ── Handoff config (v1) ───────────────────────────────────────────────────────

export type HandoffPreset = "strict" | "balanced" | "lenient";

export type HandoffConfigJson = {
  version: 1;
  global_preset: HandoffPreset;
  category_presets: Record<string, HandoffPreset>;
};

// ── Policy config (v2) ────────────────────────────────────────────────────────

export type PolicyConfigJson = {
  version: 1;
  nlPolicyInstruction?: string;
  escalation_keywords: string[];
  handoff_eagerness: "eager" | "normal" | "conservative";
};

// ── Source config (v2) ────────────────────────────────────────────────────────

export type KnowledgeSource = "help_center" | "notion_faq" | "known_issue" | "notion_cse";

export type SourceConfigJson = {
  version: 1;
  allowed: KnowledgeSource[];
  priority: KnowledgeSource[];
};

// ── Intents config (v2) ───────────────────────────────────────────────────────

export type IntentSlotConfig = {
  required: string[];
  optional: string[];
  priority: string[];
};

export type IntentHandoffConfig = {
  preset: HandoffPreset;
  required: string[];
  any_of: string[][];
};

export type IntentSkillEntry = {
  name: string;
  threshold: number;
};

export type IntentCategoryConfig = {
  enabled: boolean;
  label?: string;
  slots: IntentSlotConfig;
  handoff: IntentHandoffConfig;
  skills: IntentSkillEntry[];
  nlInstruction?: string;
  // 分類設定: LLM によるインテント分類に使用
  classifyDescription?: string;   // このカテゴリはどんな問い合わせか（自然言語）
  classifyExamples?: string[];    // 該当する発話例
  classifyPriority?: number;      // 分類優先度 (大きいほど優先, デフォルト: 5)
  classifyBoundaryNotes?: string; // 境界判定メモ（他カテゴリとの区別）
};

// ── Concierge tools ───────────────────────────────────────────────────────────

export type AvailableTool = "page-loading" | "image-reading" | "image-referencing";

export const TOOL_META: Record<AvailableTool, { label: string; desc: string }> = {
  "page-loading": {
    label: "ページ読み込み",
    desc: "ユーザーが提供したURLをフェッチし、ページのHTTPステータスやタイトルをLLMに提供します。リンク切れや503の確認に有効。",
  },
  "image-reading": {
    label: "画像読み込み",
    desc: "Intercom会話に添付された画像をClaudeのvision APIで解析し、スクリーンショットの内容をLLMが理解して回答に活用します。",
  },
  "image-referencing": {
    label: "画像参照",
    desc: "ヘルプドキュメントやナレッジベースの画像URLを回答のマークダウンに含めることを許可します。視覚的なガイダンスを提供できます。",
  },
};

export const ALL_TOOLS: AvailableTool[] = ["page-loading", "image-reading", "image-referencing"];

export type IntentsConfigJson = {
  version: 1;
  intents: Record<string, IntentCategoryConfig>;
  concierge_tools?: Record<string, AvailableTool[]>;
};

// ── Editor aggregate ──────────────────────────────────────────────────────────

export type WorkflowEditorConfig = {
  skillConfig:   SkillConfigJson;
  handoffConfig: HandoffConfigJson;
  policyConfig:  PolicyConfigJson;
  sourceConfig:  SourceConfigJson;
  intentsConfig: IntentsConfigJson;
};

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_SKILL_CONFIG: SkillConfigJson = {
  version: 1,
  category_skill_order: {},
};

export const DEFAULT_HANDOFF_CONFIG: HandoffConfigJson = {
  version: 1,
  global_preset: "balanced",
  category_presets: {},
};

export const DEFAULT_POLICY_CONFIG: PolicyConfigJson = {
  version: 1,
  nlPolicyInstruction: "",
  escalation_keywords: [],
  handoff_eagerness: "normal",
};

export const DEFAULT_SOURCE_CONFIG: SourceConfigJson = {
  version: 1,
  allowed: ["help_center", "notion_faq", "known_issue"],
  priority: ["notion_faq", "help_center", "known_issue"],
};

export const DEFAULT_INTENTS_CONFIG: IntentsConfigJson = {
  version: 1,
  intents: {},
  concierge_tools: {},
};

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseEditorConfig(workflow: Pick<WorkflowDefinition, "skill_config_json" | "handoff_config_json" | "policy_config_json" | "source_config_json" | "intents_config_json">): WorkflowEditorConfig {
  const safeParse = <T>(json: string | null | undefined, def: T): T => {
    if (!json) return def;
    try { return JSON.parse(json) as T; } catch { return def; }
  };

  return {
    skillConfig:   safeParse(workflow.skill_config_json,   { ...DEFAULT_SKILL_CONFIG,   category_skill_order: {} }),
    handoffConfig: safeParse(workflow.handoff_config_json, { ...DEFAULT_HANDOFF_CONFIG, category_presets: {} }),
    policyConfig:  safeParse(workflow.policy_config_json,  { ...DEFAULT_POLICY_CONFIG }),
    sourceConfig:  safeParse(workflow.source_config_json,  { ...DEFAULT_SOURCE_CONFIG }),
    intentsConfig: safeParse(workflow.intents_config_json, { ...DEFAULT_INTENTS_CONFIG, intents: {} }),
  };
}

// ── Preset labels ─────────────────────────────────────────────────────────────

export const HANDOFF_PRESET_META: Record<HandoffPreset, { label: string; desc: string }> = {
  strict:   { label: "厳格",  desc: "全スロット必須。確認が多くなるが情報収集が充実" },
  balanced: { label: "標準",  desc: "デフォルト条件（推奨）。required + any_of の基本条件" },
  lenient:  { label: "緩和",  desc: "最低条件のみで早めに引き継ぎ。スピード優先" },
};

export const SOURCE_LABELS: Record<KnowledgeSource, string> = {
  help_center: "Help Center",
  notion_faq:  "Notion FAQ",
  known_issue: "既知バグ DB",
  notion_cse:  "CSE ナレッジ",
};

export const HANDOFF_EAGERNESS_META: Record<PolicyConfigJson["handoff_eagerness"], { label: string; desc: string }> = {
  eager:        { label: "積極",       desc: "条件を満たしたら即 handoff" },
  normal:       { label: "標準",       desc: "デフォルト判定（推奨）" },
  conservative: { label: "慎重",       desc: "追加確認を優先。handoff を遅らせる" },
};
