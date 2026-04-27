// ─────────────────────────────────────────────────────────────────────────────
// Concierge Execution Profiles
//
// concierge レコードの policy_set_key / skill_profile_key / source_priority_profile_key
// から実行時プロファイルを解決するモジュール。
//
// 設計方針:
//   - Phase A: コード内定数 (このファイル) でプロファイルを管理
//   - Phase B: NocoDB / Admin Console からプロファイルを編集可能にする (将来)
//   - 未知 key は全て default にフォールバック
//   - concierge が null でも default プロファイルを返す
//
// プロファイルの役割:
//   policyProfile         → escalation 判定 / handoff 厳しさ
//   skillProfile          → skill 実行順 / confidence threshold 上書き / 無効化
//   sourcePriorityProfile → knowledge source の許可範囲 / 優先順
// ─────────────────────────────────────────────────────────────────────────────

// ── デフォルトエスカレーションキーワード ──────────────────────────────────────
const DEFAULT_ESCALATION_KEYWORDS = [
  "至急", "緊急", "全く使えない", "障害", "返金",
  "全員使えない", "全社員", "本番が止まっている"
];

// ── Policy Profiles ───────────────────────────────────────────────────────────
// handoffEagerness: "normal" | "eager" | "conservative"
//   eager       → handoff 条件を緩め、早めに担当者に渡す (premium 向け)
//   conservative → knowledge skill を優先し、handoff を遅らせる (self-serve 向け)
//   normal      → 現行デフォルト挙動
//
// knowledgeFirstStrength: "normal" | "strong"
//   strong → KNOWLEDGE_FIRST_CATEGORIES 以外でも skill を積極的に試す (将来拡張用)
//
export const POLICY_PROFILES = {
  default_support: {
    label: "標準サポート",
    desc: "通常の問い合わせ対応。デフォルト挙動。",
    escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
    handoffEagerness: "normal",
    knowledgeFirstStrength: "normal",
  },

  careful_escalation: {
    label: "慎重エスカレーション",
    desc: "エスカレーションキーワードを広め、知識回答を優先する。クレームリスクの低い顧客向け。",
    escalationKeywords: [
      ...DEFAULT_ESCALATION_KEYWORDS,
      "訴える", "告知します", "SNS", "口コミ", "評判"
    ],
    handoffEagerness: "conservative",
    knowledgeFirstStrength: "strong",
  },

  self_serve_first: {
    label: "セルフサービス優先",
    desc: "FAQ / Help Center で解決を促す。handoff より知識回答を優先する。",
    escalationKeywords: ["至急", "緊急", "全く使えない", "障害", "返金"],
    handoffEagerness: "conservative",
    knowledgeFirstStrength: "strong",
  },

  premium_high_touch: {
    label: "プレミアム高タッチ",
    desc: "ハイタッチサポート。不満サインで早めにエスカレーション・担当者へ渡す。",
    escalationKeywords: [
      ...DEFAULT_ESCALATION_KEYWORDS,
      "不満", "困っています", "なんとかしてください", "ひどい", "使えない"
    ],
    handoffEagerness: "eager",
    knowledgeFirstStrength: "normal",
  },
};

// ── Skill Profiles ────────────────────────────────────────────────────────────
// orderOverrides: { [category]: string[] }
//   skill 名の配列。registry の順序をこの順序で上書きする。
//   配列に含まれない skill は無効 (skip) 扱い。
//   空配列 [] = その category で skill を使わない。
//
// confidenceOverrides: { [skillName]: number }
//   採用に必要な最低 confidence をこの値で上書きする。
//
// disabled: string[]
//   全 category で無効にする skill 名。
//
export const SKILL_PROFILES = {
  default: {
    label: "デフォルト",
    desc: "registry のデフォルト順序・閾値をそのまま使う。",
    orderOverrides: {},
    confidenceOverrides: {},
    disabled: [],
  },

  faq_first: {
    label: "FAQ 優先",
    desc: "usage_guidance / experience_issue で Notion FAQ を Help Center より先に試す。",
    orderOverrides: {
      usage_guidance:   ["faq_answer", "help_center_answer"],
      experience_issue: ["faq_answer", "help_center_answer"],
    },
    confidenceOverrides: {},
    disabled: [],
  },

  help_center_first: {
    label: "Help Center 優先",
    desc: "全 category で Help Center を最優先に試す。",
    orderOverrides: {
      usage_guidance:   ["help_center_answer", "faq_answer"],
      experience_issue: ["help_center_answer", "faq_answer"],
    },
    confidenceOverrides: {},
    disabled: [],
  },

  known_bug_first: {
    label: "既知バグ優先",
    desc: "bug_report / experience_issue で既知バグマッチを最優先に試す。",
    orderOverrides: {
      bug_report:       ["known_bug_match", "faq_answer"],
      experience_issue: ["known_bug_match", "faq_answer", "help_center_answer"],
    },
    confidenceOverrides: {},
    disabled: [],
  },

  experience_specialist: {
    label: "体験問題スペシャリスト",
    desc: "experience_issue で FAQ → HC → 既知バグの順。confidence 閾値を緩めてより多くを採用。",
    orderOverrides: {
      experience_issue: ["faq_answer", "help_center_answer", "known_bug_match"],
      usage_guidance:   ["faq_answer", "help_center_answer"],
    },
    confidenceOverrides: {
      faq_answer:          0.60,
      help_center_answer:  0.60,
    },
    disabled: [],
  },
};

// ── Source Priority Profiles ──────────────────────────────────────────────────
// allowedSources: string[]
//   retrieveKnowledgeCandidates に渡す allowedSourceTypes。
//   ここに含まれない source type は retrieval 対象外。
//
export const SOURCE_PRIORITY_PROFILES = {
  default: {
    label: "デフォルト",
    desc: "Help Center + Notion FAQ + 既知バグを参照。",
    allowedSources: ["help_center", "notion_faq", "known_issue"],
  },

  help_center_first: {
    label: "Help Center 優先",
    desc: "Help Center を最優先ソースとして参照する。",
    allowedSources: ["help_center", "notion_faq", "known_issue"],
  },

  faq_first: {
    label: "FAQ 優先",
    desc: "Notion FAQ を最優先ソースとして参照する。",
    allowedSources: ["notion_faq", "help_center", "known_issue"],
  },

  internal_heavy: {
    label: "内部情報重視",
    desc: "Notion FAQ + CSE を参照する。内部補助情報も活用。",
    allowedSources: ["notion_faq", "notion_cse", "help_center", "known_issue"],
  },

  safe_public_only: {
    label: "公開情報のみ",
    desc: "Help Center のみ参照。FAQ / 既知バグは参照しない。",
    allowedSources: ["help_center"],
  },

  premium_safe: {
    label: "プレミアム安全",
    desc: "Help Center + Notion FAQ のみ参照。既知バグ情報は非開示。",
    allowedSources: ["help_center", "notion_faq"],
  },
};

// ── ExecutionProfile ──────────────────────────────────────────────────────────

/**
 * concierge レコードから実行プロファイルを解決する。
 *
 * @param {object|null} concierge NocoDB concierge レコード
 * @returns {{
 *   conciergeKey: string|null,
 *   conciergeName: string|null,
 *   policyProfileKey: string,
 *   skillProfileKey: string,
 *   sourcePriorityProfileKey: string,
 *   policyProfile: object,
 *   skillProfile: object,
 *   sourcePriorityProfile: object,
 * }}
 */
export function resolveExecutionProfile(concierge) {
  const policyKey  = concierge?.policy_set_key              || "default_support";
  const skillKey   = concierge?.skill_profile_key            || "default";
  const sourceKey  = concierge?.source_priority_profile_key  || "default";

  return {
    conciergeKey:             concierge?.concierge_key  ?? null,
    conciergeName:            concierge?.display_name   ?? null,
    policyProfileKey:         policyKey,
    skillProfileKey:          skillKey,
    sourcePriorityProfileKey: sourceKey,
    policyProfile:            POLICY_PROFILES[policyKey]         ?? POLICY_PROFILES.default_support,
    skillProfile:             SKILL_PROFILES[skillKey]            ?? SKILL_PROFILES.default,
    sourcePriorityProfile:    SOURCE_PRIORITY_PROFILES[sourceKey] ?? SOURCE_PRIORITY_PROFILES.default,
  };
}

/**
 * skillProfile を使って category の skill エントリーを並べ替え / フィルタした配列を返す。
 *
 * @param {import("./skills/registry.js").SkillEntry[]} baseEntries  registry のデフォルト配列
 * @param {string} category
 * @param {object} skillProfile  SKILL_PROFILES の値
 * @returns {import("./skills/registry.js").SkillEntry[]}
 */
export function applySkillProfileOrder(baseEntries, category, skillProfile) {
  const orderOverride = skillProfile?.orderOverrides?.[category];
  const disabled      = skillProfile?.disabled ?? [];

  // disabled を先に除外
  let entries = baseEntries.filter((e) => !disabled.includes(e.name));

  if (orderOverride && orderOverride.length > 0) {
    // orderOverride にある skill 名の順序で並べ替え。含まれていない skill は除外。
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    entries = orderOverride
      .map((name) => byName[name])
      .filter(Boolean);
  }

  // confidence 閾値の上書き
  const confOverrides = skillProfile?.confidenceOverrides ?? {};
  if (Object.keys(confOverrides).length > 0) {
    entries = entries.map((e) =>
      confOverrides[e.name] !== undefined
        ? { ...e, confidenceThreshold: confOverrides[e.name] }
        : e
    );
  }

  return entries;
}

/**
 * 各プロファイルキーとその説明を返す (Admin Console 表示用)。
 */
export function getProfileCatalog() {
  return {
    policyProfiles:         Object.entries(POLICY_PROFILES).map(([key, v]) => ({ key, label: v.label, desc: v.desc })),
    skillProfiles:          Object.entries(SKILL_PROFILES).map(([key, v]) => ({ key, label: v.label, desc: v.desc })),
    sourcePriorityProfiles: Object.entries(SOURCE_PRIORITY_PROFILES).map(([key, v]) => ({ key, label: v.label, desc: v.desc })),
  };
}
