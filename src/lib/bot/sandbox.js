// ─────────────────────────────────────────────────────────────────────────────
// Sandbox Simulation Runner
//
// 本番副作用ゼロで Bot 処理全体をシミュレートする純粋関数。
//
// 行わないこと (副作用なし):
//   - Intercom への返信送信
//   - NocoDB sessions / messages / slots への書き込み
//
// 行うこと (読み取りのみ):
//   - LLM を使ったカテゴリ分類・スロット抽出・次質問生成
//   - NocoDB knowledge_chunks / known_issues の読み取り (skill 実行)
//   - NocoDB concierges の読み取り (concierge resolve)
// ─────────────────────────────────────────────────────────────────────────────

import { classifyCategory, extractSlots, generateNextQuestion } from "./llm.js";
import {
  REQUIRED_SLOTS_BY_CATEGORY,
  SLOT_PRIORITY_BY_CATEGORY,
  CATEGORY_LIST,
  HANDOFF_MIN_CONDITION_BY_CATEGORY
} from "./categories.js";
import { isReadyForHandoff } from "./handoff-guard.js";
import { runSkillOrchestration } from "./skills/orchestrator.js";
import { initDynamicSkills, getSkillsForCategory, getLastInitResult } from "./skills/registry.js";
import { resolveReplyMessage } from "./reply-resolver.js";
import { getConciergeByKey, getMainConcierge } from "./nocodb-repo.js";
import { getActiveWorkflow, parseWorkflowOverrides } from "./workflow-resolver.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const KNOWLEDGE_FIRST_CATEGORIES = new Set(["usage_guidance", "experience_issue"]);
const ESCALATION_KEYWORDS = ["至急", "緊急", "全く使えない", "障害", "返金", "全員使えない", "全社員", "本番が止まっている"];
const FALLBACK_CATEGORY = "usage_guidance";

const SLOT_LABELS = {
  project_name_or_id:    "プロジェクト名またはID",
  target_url:            "対象URL",
  symptom:               "具体的な症状",
  occurred_at:           "発生日時",
  recent_change:         "最近の変更内容",
  tag_type:              "タグの設置方法",
  report_name:           "レポート名",
  date_range:            "対象期間",
  compare_target:        "比較対象",
  expected_value:        "期待値",
  actual_value:          "実際の値",
  account_email_or_user: "メールアドレスまたはユーザー名",
  occurred_screen:       "発生した画面",
  error_message:         "エラーメッセージ",
  contract_target:       "契約対象",
  inquiry_topic:         "お問い合わせ内容",
  target_period:         "対象期間",
  cancellation_reason:   "解約理由",
  reproduction_steps:    "再現手順",
  experience_name:       "体験名またはポップアップ名",
  target_feature:        "対象機能",
  user_goal:             "やりたいこと",
  feature_category:      "機能の種別",
  device_type:           "デバイス種別"
};

function buildFallbackNextMessage(askSlots) {
  if (askSlots.length === 0) return "ご連絡ありがとうございます。確認しております。";
  const labels = askSlots.map((s) => SLOT_LABELS[s] || s).join("と");
  return `確認のため、${labels}を教えていただけますか？`;
}

function buildDecisionTrace({ shouldEscalate, status, selectedSkill, skillAccepted, replySource }) {
  const parts = [
    `escalation=${shouldEscalate}`,
    `status=${status}`
  ];
  if (selectedSkill) {
    parts.push(`skill=${selectedSkill}(${skillAccepted ? "accepted" : "rejected"})`);
  } else {
    parts.push("skill=none");
  }
  parts.push(`reply_source=${replySource}`);
  return parts.join(" > ");
}

/**
 * 本番副作用ゼロでボット処理全体をシミュレートする。
 *
 * @param {{
 *   latestUserMessage: string,
 *   forceCategory?: string|null,
 *   conciergeKey?: string|null,
 *   conversationId?: string|null,
 *   contactId?: string|null,
 * }} opts
 */
export async function runSandboxSimulation({
  latestUserMessage,
  forceCategory = null,
  conciergeKey = null,
  conversationId = null,
  contactId = null,
}) {
  const ctx = {
    sandbox: true,
    conversation_id: conversationId || `sandbox_${Date.now()}`,
    contact_id: contactId || null,
  };

  logger.info("sandbox simulation started", { ...ctx, latestUserMessage, forceCategory, conciergeKey });

  // ── 初期化: 動的スキルとワークフロー設定を読み込む ──────────────────────
  await initDynamicSkills().catch((err) => {
    logger.warn("sandbox: initDynamicSkills failed", { error: err?.message, ...ctx });
  });
  let intentsConfig = { intents: {} };
  let workflowSourceConfig = { allowed: ["help_center", "notion_faq", "known_issue"] };
  try {
    const workflow = await getActiveWorkflow();
    const overrides = parseWorkflowOverrides(workflow);
    intentsConfig = overrides.intentsConfig;
    workflowSourceConfig = overrides.sourceConfig ?? workflowSourceConfig;
  } catch { /* fallback */ }

  // workflow source_config_json → sourcePriorityProfile 形式に変換してスキルに渡す
  const workflowSourceProfile = workflowSourceConfig?.allowed?.length > 0
    ? { allowedSources: workflowSourceConfig.allowed }
    : null;

  // ワークフローのカスタムカテゴリを含む動的リスト（ラベル・説明付き）
  const workflowCategoryEntries = Object.entries(intentsConfig?.intents ?? {})
    .filter(([k, v]) => !CATEGORY_LIST.includes(k) && v?.enabled !== false)
    .map(([k, v]) => ({
      key: k,
      label: v.label ?? k,
      description: (v.classifyDescription ?? "").slice(0, 120),
    }));
  // ワークフロー設定で明示的に enabled:false のテンプレートカテゴリは除外
  const enabledTemplateCats = CATEGORY_LIST.filter(k => {
    const cfg = intentsConfig?.intents?.[k];
    return !cfg || cfg.enabled !== false;
  });
  const dynamicCategoryList = [
    ...enabledTemplateCats,
    ...workflowCategoryEntries.map(e => e.key),
  ];
  // 分類器に渡すエンリッチ候補（テンプレートカテゴリはキーのみ、カスタムはラベル+説明付き）
  const enrichedCandidates = [
    ...enabledTemplateCats,
    ...workflowCategoryEntries,
  ];

  // ── Step 1: Category classification ─────────────────────────────────────
  // forceCategory はテスト UI から渡す管理者指定値なので、dynamicCategoryList 検証を外して信頼する。
  // バックエンドの intentsConfig に未保存のカスタムカテゴリでも強制適用できるようにする。
  let category = forceCategory || null;
  let classifyConfidence = forceCategory ? 1.0 : 0;
  let classifyReason = forceCategory ? "forced" : null;

  if (!category) {
    if (config.llm.apiKey) {
      try {
        const result = await classifyCategory({ latestUserMessage, categoryCandidates: enrichedCandidates });
        category = dynamicCategoryList.includes(result.category) ? result.category : FALLBACK_CATEGORY;
        classifyConfidence = result.confidence ?? 0;
        classifyReason = result.reason ?? null;
      } catch (err) {
        category = FALLBACK_CATEGORY;
        classifyConfidence = 0;
        classifyReason = `classification error: ${err?.message}`;
        logger.warn("sandbox: classification failed, using fallback", { error: err?.message, ...ctx });
      }
    } else {
      category = FALLBACK_CATEGORY;
      classifyConfidence = 0;
      classifyReason = "LLM_API_KEY not configured";
    }
  }

  logger.info("sandbox: category resolved", { category, confidence: classifyConfidence, forced: !!forceCategory, ...ctx });

  // ── Step 2: Escalation check (keyword, pure) ─────────────────────────────
  const triggeredKeywords = ESCALATION_KEYWORDS.filter((kw) => latestUserMessage.includes(kw));
  const shouldEscalate = triggeredKeywords.length > 0;

  // ── Step 3: Slot extraction (in-memory, no DB write) ─────────────────────
  const requiredSlotNames = REQUIRED_SLOTS_BY_CATEGORY[category] || [];
  let extractedSlotMap = {};

  if (requiredSlotNames.length > 0 && !shouldEscalate && config.llm.apiKey) {
    try {
      const slotResult = await extractSlots({ category, requiredSlots: requiredSlotNames, latestUserMessage });
      const extracted = Array.isArray(slotResult?.slots) ? slotResult.slots : [];
      for (const { slot_name, slot_value, confidence } of extracted) {
        if (requiredSlotNames.includes(slot_name) && slot_value != null && String(slot_value).trim() !== "") {
          extractedSlotMap[slot_name] = { value: slot_value, confidence };
        }
      }
    } catch (err) {
      logger.warn("sandbox: slot extraction failed", { error: err?.message, ...ctx });
    }
  }

  // Build slot objects (in-memory representation)
  const slots = requiredSlotNames.map((name) => {
    const extracted = extractedSlotMap[name];
    return {
      slot_name: name,
      slot_value: extracted?.value ?? null,
      is_collected: !!extracted,
      is_required: true,
      confidence: extracted?.confidence ?? null,
      label: SLOT_LABELS[name] || name,
    };
  });

  const filledSlots = slots.filter((s) => s.is_collected);
  const missingSlots = slots.filter((s) => !s.is_collected);

  // ── Step 4: Handoff readiness check ──────────────────────────────────────
  const readyForHandoff = !shouldEscalate && isReadyForHandoff(category, slots);
  const status = readyForHandoff ? "ready_for_handoff" : "collecting";

  // ── Step 5: Skill orchestration (read-only NocoDB) ──────────────────────
  let skillResult = null;
  let answerCandidateJson = {};

  // スキルを試す条件:
  //   - エスカレーションなし
  //   - collecting 状態、または ready_for_handoff でもスキルが設定されているカテゴリ
  const intentCfg = intentsConfig?.intents?.[category];
  const categoryHasSkills =
    KNOWLEDGE_FIRST_CATEGORIES.has(category) ||
    (intentCfg?.skills ?? []).length > 0 ||
    getSkillsForCategory(category).length > 0;
  const shouldTrySkill = !shouldEscalate && (status === "collecting" || (status === "ready_for_handoff" && categoryHasSkills));

  if (shouldTrySkill) {
    const collectedSlots = Object.fromEntries(
      filledSlots.map((s) => [s.slot_name, s.slot_value])
    );
    try {
      skillResult = await runSkillOrchestration({ category, latestUserMessage, collectedSlots, workflowSourceProfile, ctx });
      if (skillResult.handled) {
        answerCandidateJson = {
          answer_type:         skillResult.answer_type,
          answer_message:      skillResult.answer_message,
          confidence:          skillResult.confidence,
          retrieval_query:     skillResult.retrieval_query ?? null,
          candidate_titles:    skillResult.candidate_titles ?? [],
          candidate_chunk_ids: skillResult.candidate_chunk_ids ?? [],
          skill_candidates:    skillResult.candidate_results ?? [],
          selected_skill:      skillResult.selected_skill,
        };
      } else {
        answerCandidateJson.skill_candidates = skillResult.candidate_results ?? [];
      }
    } catch (err) {
      logger.warn("sandbox: skill orchestration failed", { error: err?.message, ...ctx });
    }
  }

  // ── Step 6: Next question generation (collecting + no skill) ─────────────
  if (!skillResult?.handled && status === "collecting" && !shouldEscalate) {
    const priority = SLOT_PRIORITY_BY_CATEGORY[category] || requiredSlotNames;
    const missingNames = new Set(missingSlots.map((s) => s.slot_name));
    const askSlots = priority.filter((name) => missingNames.has(name)).slice(0, 2);

    let nextMessage = buildFallbackNextMessage(askSlots);

    if (config.llm.apiKey && askSlots.length > 0) {
      const collectedSlots = Object.fromEntries(filledSlots.map((s) => [s.slot_name, s.slot_value]));
      try {
        const result = await generateNextQuestion({
          category,
          requiredSlots: requiredSlotNames,
          collectedSlots,
          askSlots,
          latestUserMessage,
          conversationHistorySummary: null,
          escalationSignals: [],
        });
        nextMessage = result.next_message || nextMessage;
      } catch (err) {
        logger.warn("sandbox: next question generation failed", { error: err?.message, ...ctx });
      }
    }

    answerCandidateJson.ask_slots = askSlots;
    answerCandidateJson.next_message = nextMessage;
  }

  // ── Step 7: Reply resolution (pure) ─────────────────────────────────────
  answerCandidateJson.should_escalate = shouldEscalate;
  const { replyMessage, replySource } = resolveReplyMessage({
    answerCandidateJson,
    shouldEscalate,
    status,
  });

  // ── Step 8: Concierge resolution (read-only NocoDB) ──────────────────────
  let concierge = null;
  let conciergeSource = "none";

  if (conciergeKey) {
    try {
      concierge = await getConciergeByKey(conciergeKey);
      if (concierge) conciergeSource = "specified";
    } catch (err) {
      logger.warn("sandbox: concierge fetch by key failed", { conciergeKey, error: err?.message, ...ctx });
    }
  }

  if (!concierge) {
    try {
      concierge = await getMainConcierge();
      if (concierge) conciergeSource = "main_fallback";
    } catch (err) {
      logger.warn("sandbox: main concierge fetch failed", { error: err?.message, ...ctx });
    }
  }

  // ── Step 9: Decision trace ───────────────────────────────────────────────
  const selectedSkill = skillResult?.selected_skill ?? null;
  const skillAccepted = skillResult?.handled ?? false;
  const decisionTrace = buildDecisionTrace({ shouldEscalate, status, selectedSkill, skillAccepted, replySource });
  const registryDebug = getLastInitResult();

  logger.info("sandbox simulation completed", {
    category,
    status,
    should_escalate: shouldEscalate,
    reply_source: replySource,
    selected_skill: selectedSkill,
    concierge_key: concierge?.concierge_key ?? null,
    ...ctx
  });

  return {
    category,
    category_forced: !!forceCategory && category === forceCategory,
    confidence: classifyConfidence,
    classify_reason: classifyReason,

    should_escalate: shouldEscalate,
    escalation_keywords: triggeredKeywords,

    status,

    slots,
    slots_filled_count: filledSlots.length,
    slots_missing_count: missingSlots.length,

    selected_skill: selectedSkill,
    reply_source: replySource,
    reply_candidate: replyMessage,

    answer_candidate_json: answerCandidateJson,

    concierge: concierge
      ? {
          key:               concierge.concierge_key,
          name:              concierge.display_name,
          intercom_admin_id: concierge.intercom_admin_id ?? null,
          source:            conciergeSource,
        }
      : null,

    decision_trace: decisionTrace,

    registry_debug: {
      skills_table_configured: registryDebug.skillsTableConfigured,
      loaded_skill_keys:       registryDebug.loadedSkillKeys,
      registered_for_category: registryDebug.registeredByCategory[category] ?? [],
      init_error:              registryDebug.error,
    },
  };
}
