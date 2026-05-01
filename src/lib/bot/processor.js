import { extractIntercomEvent } from "./intercom-extract.js";
import {
  createMessage,
  createSession,
  createSlot,
  countMessagesBySessionUid,
  findMessageByIntercomMessageId,
  findSessionByConversationId,
  listSlotsBySessionUid,
  updateSession,
  updateSlot
} from "./nocodb-repo.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { replyToConversation } from "./intercom-api.js";
import { classifyCategory, extractSlots, generateNextQuestion } from "./llm.js";
import { CATEGORY_LIST, REQUIRED_SLOTS_BY_CATEGORY, SLOT_PRIORITY_BY_CATEGORY } from "./categories.js";
import { resolveReplyMessage } from "./reply-resolver.js";
import { isAllowedReplyTarget } from "./reply-guard.js";
import { resolveTargetAndConcierge } from "./targeting.js";
import { isReadyForHandoff, resolveHandoffReason } from "./handoff-guard.js";
import { dbStatusToInternal, buildSessionObservabilityFields, validateSessionCreatePayload } from "./nocodb-mapper.js";
import { runSkillOrchestration } from "./skills/orchestrator.js";
import { getActiveWorkflow, parseWorkflowOverrides, mergeWorkflowSkillProfile, resolveHandoffPreset, resolveIntentConfig, resolveEscalationKeywords } from "./workflow-resolver.js";
import { resolveExecutionProfile } from "./concierge-profiles.js";
import { buildHandoffSummary } from "./handoff-summary.js";
import { enrichContactFromUrl } from "./project-enrichment.js";

// ─────────────────────────────────────────────
// self-reply loop prevention (2段構え)
// ─────────────────────────────────────────────
const USER_TOPICS = new Set(["conversation.user.created", "conversation.user.replied"]);

// LLM 未設定または分類失敗時のデフォルトカテゴリ
const FALLBACK_CATEGORY = "usage_guidance";

// knowledge-first intents: handoff より前に FAQ / Help Center skill を試す
// これらは情報収集よりも「答えを出す」ことが優先される intent
const KNOWLEDGE_FIRST_CATEGORIES = new Set(["usage_guidance", "experience_issue"]);

// エスカレーション判定キーワード (簡易ルール)
// 「解約」は billing_contract での structured handoff で対応するため除外。
// 返金・クレーム色が強いものは引き続き即時 escalation。
const ESCALATION_KEYWORDS = ["至急", "緊急", "全く使えない", "障害", "返金", "全員使えない", "全社員", "本番が止まっている"];

// slot 名 → 日本語ラベル (fallback メッセージ生成用)
const SLOT_LABELS = {
  project_name_or_id:    "プロジェクト名またはID",
  target_url:            "対象URL",
  symptom:               "具体的な症状",
  occurred_at:           "発生日時",
  recent_change:         "最近の変更内容",
  tag_type:              "タグの設置方法（GTM/直接埋め込み等）",
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
  device_type:           "デバイス種別（PC/スマホ等）"
};

function makeSessionUid(conversationId) {
  return `sess_${conversationId}`;
}

function isoFromUnix(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n)) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

function isFilledSlot(slot) {
  return (
    slot.is_collected &&
    slot.slot_value !== null &&
    slot.slot_value !== undefined &&
    String(slot.slot_value).trim() !== ""
  );
}

// ─────────────────────────────────────────────
// エスカレーション判定 (キーワードベース)
// workflowKeywords が空でなければ workflow v2 の keywords を使う
// ─────────────────────────────────────────────
function checkEscalation(message, workflowKeywords = []) {
  const keywords = workflowKeywords.length > 0 ? workflowKeywords : ESCALATION_KEYWORDS;
  return keywords.some((kw) => message.includes(kw));
}

function resolveEscalationReason(message, workflowKeywords = []) {
  const keywords = workflowKeywords.length > 0 ? workflowKeywords : ESCALATION_KEYWORDS;
  const triggered = keywords.filter((kw) => message.includes(kw));
  if (triggered.length === 0) return null;
  return triggered.map((kw) => `keyword:${kw}`).join(", ");
}

// ─────────────────────────────────────────────
// reply 決定過程の trace 文字列を生成
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// observability フィールドの保存ヘルパー
//
// - 保存前に payload の有無をログに出す
// - 例外を catch して bot 全体を落とさない
// - answer_candidate_json / final_summary_json のどちらを保存するかを明示
// ─────────────────────────────────────────────
async function persistSessionFields(rowId, patch, ctx) {
  if (!rowId) {
    logger.warn("session update skipped (rowId missing)", ctx);
    return;
  }
  logger.info("session update attempted", { rowId, ...ctx });

  const hasAcj = patch.answerCandidateJson !== undefined && patch.answerCandidateJson !== null;
  const hasFsj = patch.finalSummaryJson !== undefined && patch.finalSummaryJson !== null;

  logger.info("session update payload prepared", {
    rowId,
    has_answer_candidate_json: hasAcj,
    has_final_summary_json: hasFsj,
    answer_candidate_json_length: hasAcj ? String(patch.answerCandidateJson).length : 0,
    final_summary_json_length: hasFsj ? String(patch.finalSummaryJson).length : 0,
    ...ctx
  });

  try {
    await updateSession(rowId, patch);
    logger.info("sessions updated successfully", {
      rowId,
      has_answer_candidate_json: hasAcj,
      has_final_summary_json: hasFsj,
      ...ctx
    });
  } catch (err) {
    logger.warn("session update failed", {
      rowId,
      has_answer_candidate_json: hasAcj,
      has_final_summary_json: hasFsj,
      error: err?.message,
      ...ctx
    });
  }
}

// ─────────────────────────────────────────────
// category 判定: LLM 未設定時は fallback
// ─────────────────────────────────────────────
async function runClassification(latestUserMessage, ctx, intentsConfig = null) {
  if (!config.llm.apiKey) {
    logger.info("category fallback used (LLM_API_KEY not set)", { category: FALLBACK_CATEGORY, confidence: 0, ...ctx });
    return { category: FALLBACK_CATEGORY, confidence: 0, reason: "LLM_API_KEY not configured" };
  }

  // ワークフローのカスタムカテゴリをエンリッチして分類候補に追加
  const customEntries = Object.entries(intentsConfig?.intents ?? {})
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
  const allCandidates = [...enabledTemplateCats, ...customEntries];
  const allKeys = [...enabledTemplateCats, ...customEntries.map(e => e.key)];

  logger.info("category classification started", ctx);
  try {
    const result = await classifyCategory({ latestUserMessage, categoryCandidates: allCandidates });
    const category = allKeys.includes(result.category) ? result.category : FALLBACK_CATEGORY;
    const confidence = result.confidence ?? 0;
    const reason = result.reason ?? "";
    if (category !== result.category) {
      logger.info("category fallback used (unknown category from LLM)", { category, rawCategory: result.category, confidence, ...ctx });
    } else {
      logger.info("category classified", { category, confidence, reason, ...ctx });
    }
    return { category, confidence, reason };
  } catch (err) {
    logger.warn("category classification failed, using fallback", { error: err?.message, ...ctx });
    logger.info("category fallback used", { category: FALLBACK_CATEGORY, confidence: 0, ...ctx });
    return { category: FALLBACK_CATEGORY, confidence: 0, reason: `classification error: ${err?.message}` };
  }
}

// ─────────────────────────────────────────────
// required slots 初期投入 (重複スキップ付き)
// intentOverride があれば workflow v2 のスロット定義を使う
// ─────────────────────────────────────────────
async function initRequiredSlots(sessionUid, category, ctx, intentOverride = null) {
  if (!config.nocodb.tables.slots) {
    logger.warn("NOCODB_SLOTS_TABLE_ID not set, skipping slot init", { sessionUid, category });
    return;
  }

  const required = intentOverride?.slots?.required ?? REQUIRED_SLOTS_BY_CATEGORY[category] ?? [];
  if (required.length === 0) return;

  const existing = await listSlotsBySessionUid(sessionUid);
  const existingNames = new Set(existing.map((s) => s.slot_name));

  let created = 0;
  let skipped = 0;

  for (const slotName of required) {
    if (existingNames.has(slotName)) {
      logger.info("slot init skipped (already exists)", { sessionUid, slotName, category, ...ctx });
      skipped++;
    } else {
      await createSlot({
        sessionUid,
        slotName,
        slotValue: null,
        isRequired: true,
        isCollected: false,
        source: "system",
        confidence: 1.0
      });
      created++;
    }
  }

  logger.info("required slots initialized", {
    sessionUid,
    category,
    slotCount: required.length,
    created,
    skipped,
    ...ctx
  });
}

// ─────────────────────────────────────────────
// slot 抽出: latest_user_message から required slots を埋める
// intentOverride があれば workflow v2 のスロット定義を使う
// ─────────────────────────────────────────────
async function runSlotExtraction(sessionUid, category, latestUserMessage, ctx, intentOverride = null) {
  if (!config.nocodb.tables.slots) return;

  const requiredSlots = intentOverride?.slots?.required ?? REQUIRED_SLOTS_BY_CATEGORY[category] ?? [];
  if (requiredSlots.length === 0) return;

  logger.info("slot extraction started", { sessionUid, category, ...ctx });

  let extracted = [];
  try {
    const result = await extractSlots({ category, requiredSlots, latestUserMessage });
    extracted = Array.isArray(result?.slots) ? result.slots : [];
  } catch (err) {
    logger.warn("slot extraction failed", { sessionUid, category, error: err?.message, ...ctx });
    return;
  }

  if (extracted.length === 0) {
    logger.info("slot extraction skipped (no slots extracted)", { sessionUid, category, ...ctx });
    return;
  }

  const existing = await listSlotsBySessionUid(sessionUid);
  const slotMap = new Map(existing.map((s) => [s.slot_name, s]));

  let updatedCount = 0;

  for (const { slot_name, slot_value, confidence } of extracted) {
    if (!requiredSlots.includes(slot_name)) continue;

    const existingSlot = slotMap.get(slot_name);
    if (!existingSlot) continue;

    const existingValue = existingSlot.slot_value;
    if (existingValue !== null && existingValue !== undefined && String(existingValue).trim() !== "") {
      logger.info("slot update skipped (already filled)", { sessionUid, category, slot_name, ...ctx });
      continue;
    }

    const rowId = existingSlot.Id || existingSlot.id;
    await updateSlot(rowId, {
      slotValue: slot_value,
      isCollected: true,
      source: "user_message",
      confidence
    });
    logger.info("slot extracted", { sessionUid, category, slot_name, confidence, ...ctx });
    logger.info("slot updated", { sessionUid, category, slot_name, ...ctx });
    updatedCount++;
  }

  logger.info("slot extraction completed", { sessionUid, category, updated_count: updatedCount, ...ctx });
}

// ─────────────────────────────────────────────
// missing slots から ask_slots を優先順位で最大2件選ぶ
// ─────────────────────────────────────────────
function selectAskSlots(category, slots, intentOverride = null) {
  const priority = intentOverride?.slots?.priority
    ?? SLOT_PRIORITY_BY_CATEGORY[category]
    ?? intentOverride?.slots?.required
    ?? REQUIRED_SLOTS_BY_CATEGORY[category]
    ?? [];
  const missingNames = new Set(
    slots
      .filter((s) => s.is_required && !isFilledSlot(s))
      .map((s) => s.slot_name)
  );
  return priority.filter((name) => missingNames.has(name)).slice(0, 2);
}

// ─────────────────────────────────────────────
// fallback next_message: テンプレートベース生成
// ─────────────────────────────────────────────
function buildFallbackNextMessage(askSlots) {
  if (askSlots.length === 0) return "ご連絡ありがとうございます。確認しております。";
  const labels = askSlots.map((s) => SLOT_LABELS[s] || s).join("と");
  return `確認のため、${labels}を教えていただけますか？`;
}

// ─────────────────────────────────────────────
// 次質問候補の生成 (DB 保存は processor が行う)
// (status=collecting のときのみ呼ばれる)
// shouldEscalate は主フローで判定済みのものを受け取る
// ─────────────────────────────────────────────
async function runNextQuestionGeneration(sessionUid, session, latestUserMessage, shouldEscalate, slots, ctx, intentOverride = null, authorName = null, isFirstContact = false) {
  if (!config.nocodb.tables.slots) {
    return { candidateData: null };
  }

  const category = session.category;
  const missingSlots = slots.filter((s) => s.is_required && !isFilledSlot(s));

  logger.info("next question generation started", { sessionUid, category, ...ctx });
  logger.info("missing slots detected", {
    sessionUid,
    category,
    count: missingSlots.length,
    missing: missingSlots.map((s) => s.slot_name),
    ...ctx
  });

  const askSlots = selectAskSlots(category, slots, intentOverride);
  logger.info("ask slots selected", { sessionUid, category, ask_slots: askSlots, ...ctx });

  // all slots collected (collecting 状態だが required slots が全部埋まっている)
  if (askSlots.length === 0 && missingSlots.length === 0) {
    logger.info("next question generation skipped (all slots collected)", { sessionUid, category, ...ctx });
    return {
      candidateData: {
        ask_slots: [],
        next_message: "必要な情報がすべて揃いました。",
        should_escalate: shouldEscalate,
        reason: "all required slots collected",
        reply_source_candidate: "next_message"
      }
    };
  }

  // エスカレーション時は LLM 質問生成をスキップ
  let nextMessage = buildFallbackNextMessage(askSlots);
  let reason = "fallback template";

  if (config.llm.apiKey && askSlots.length > 0 && !shouldEscalate) {
    const collectedSlots = Object.fromEntries(
      slots.filter((s) => s.is_collected && s.slot_value).map((s) => [s.slot_name, s.slot_value])
    );

    try {
      const result = await generateNextQuestion({
        category,
        requiredSlots: intentOverride?.slots?.required ?? REQUIRED_SLOTS_BY_CATEGORY[category] ?? [],
        collectedSlots,
        askSlots,
        latestUserMessage,
        conversationHistorySummary: null,
        escalationSignals: [],
        customerName: authorName || null,
        isFirstContact: isFirstContact || false
      });
      nextMessage = result.next_message || nextMessage;
      reason = result.reason || reason;
      logger.info("next question generated", { sessionUid, category, ask_slots: askSlots, ...ctx });
    } catch (err) {
      logger.warn("next question generation failed, using fallback", { sessionUid, category, error: err?.message, ...ctx });
      logger.info("next question fallback used", { sessionUid, category, ask_slots: askSlots, ...ctx });
    }
  } else if (!config.llm.apiKey) {
    logger.info("next question fallback used", { sessionUid, category, ask_slots: askSlots, llm_key_set: false, ...ctx });
  }

  return {
    candidateData: {
      ask_slots: askSlots,
      next_message: nextMessage,
      should_escalate: shouldEscalate,
      reason,
      reply_source_candidate: "next_message"
    }
  };
}

export async function processIntercomWebhook(payload) {
  // ── 1. extract ──────────────────────────────
  const event = extractIntercomEvent(payload);

  // source フィールド: 2通目が期待通りの topic で来ているか診断するために記録する
  const rawItem  = payload?.data?.item || payload?.item || null;
  const rawSrc   = rawItem?.source || rawItem?.conversation_message || null;
  const sourceType  = rawSrc?.type ?? null;         // "email" / "chat" など
  const deliveredAs = rawSrc?.delivered_as ?? null; // "customer_reply" / "campaign" など

  const ctx = {
    event_topic: event.event_topic,
    intercom_conversation_id: event.intercom_conversation_id,
    intercom_message_id: event.intercom_message_id,
    author_type: event.author_type
  };

  // source_type / delivered_as / message_id_source は観測用なので extracted event ログにだけ含める
  logger.info("extracted event", {
    ...ctx,
    source_type:       sourceType,
    delivered_as:      deliveredAs,
    message_id_source: event.message_id_source  // どこから message_id を取ったか
  });

  // ── 2a. loop prevention: topic ──────────────
  // user intake 対象外 topic は処理しないが、観測のためにログは残す。
  // 2通目が user.replied でなく別 topic で届いている場合にここで検出できる。
  if (event.event_topic && !USER_TOPICS.has(event.event_topic)) {
    logger.info("non-user topic received", {
      ...ctx,
      source_type: sourceType,
      delivered_as: deliveredAs
    });
    return;
  }

  // ── 2b. loop prevention: author_type ────────
  if (event.author_type && event.author_type !== "user") {
    logger.info("non-user author received", {
      ...ctx,
      source_type: sourceType,
      delivered_as: deliveredAs
    });
    return;
  }

  // ── 3. 必須識別子チェック ──────────────────
  if (!event.intercom_conversation_id || !event.intercom_message_id) {
    logger.warn("missing required identifiers, skipping", ctx);
    return;
  }

  // ── 4. 重複チェック (message_id ベース) ─────
  // 同一 message_id なら Intercom の retry または二重配信と判断してスキップする。
  // conversation.user.created (1ターン目) と conversation.user.replied (2ターン目以降) は
  // 異なる message_id を持つため、replied は正常に処理される。
  const duplicate = await findMessageByIntercomMessageId(event.intercom_message_id);
  if (duplicate) {
    logger.info("duplicate message skipped", {
      ...ctx,
      is_retry_candidate: event.event_topic === "conversation.user.created"
    });
    return;
  }

  // ── 4.5. project enrichment (conversation.user.created のみ) ──────────
  if (event.event_topic === "conversation.user.created" && event.intercom_contact_id) {
    const sourceUrl = rawSrc?.url ?? null;
    logger.info("project-enrichment: source url", { sourceUrl, contact_id: event.intercom_contact_id, ...ctx });
    if (sourceUrl) {
      await enrichContactFromUrl(event.intercom_contact_id, sourceUrl).catch(err =>
        logger.warn("project-enrichment failed (non-fatal)", { error: err?.message, ...ctx })
      );
    } else {
      logger.info("project-enrichment: skipped (no source url)", ctx);
    }
  }

  // ── 5. session upsert ───────────────────────
  let session = await findSessionByConversationId(event.intercom_conversation_id);
  const sessionUid = session?.session_uid || makeSessionUid(event.intercom_conversation_id);

  if (!session) {
    const createCtx = {
      session_uid: sessionUid,
      conversation_id: event.intercom_conversation_id,
      contact_id: event.intercom_contact_id ?? null
    };
    // create 前バリデーション: 必須識別子が揃っていない場合は空レコードを作らずスキップ
    const { valid, reason } = validateSessionCreatePayload({
      sessionUid,
      conversationId: event.intercom_conversation_id
    });
    if (!valid) {
      logger.warn("session create validation failed", { ...createCtx, reason });
      logger.info("session create skipped", createCtx);
      return;
    }
    logger.info("session create attempted", createCtx);
    session = await createSession({
      sessionUid,
      conversationId: event.intercom_conversation_id,
      contactId: event.intercom_contact_id,
      latestUserMessage: event.latest_user_message,
      category: null
    });
    logger.info("session created", { sessionUid, status: "collecting", ...ctx });
  } else {
    await updateSession(session.Id || session.id, {
      latestUserMessage: event.latest_user_message
    });
    logger.info("session reused", { sessionUid, status: session.status || "collecting", ...ctx });
  }

  // session の現在状態をローカルで追跡 (NocoDB 値を内部値に変換)
  let currentStatus = dbStatusToInternal(session.status);
  // session の rowId を一度確定させる (以降すべての updateSession で使う)
  const sessionRowId = session?.Id || session?.id;

  // rowId 確定ログ (デバッグ用: Id が取れない場合に空レコード問題を検出できる)
  logger.info("session row resolved", {
    rowId: sessionRowId,
    session_uid: sessionUid,
    conversation_id: event.intercom_conversation_id,
    contact_id: event.intercom_contact_id ?? null
  });

  // rowId が取れない場合は以降の UPDATE が空レコードを作るリスクがある → 安全のため中断
  if (!sessionRowId) {
    logger.warn("session row id missing after upsert, aborting to prevent empty record creation", {
      session_uid: sessionUid,
      conversation_id: event.intercom_conversation_id
    });
    return;
  }

  // ── 6. message 保存 ─────────────────────────
  const messageOrder = (await countMessagesBySessionUid(sessionUid)) + 1;
  await createMessage({
    sessionUid,
    messageId: event.intercom_message_id,
    role: "user",
    messageText: event.latest_user_message,
    messageOrder,
    createdAtTs: isoFromUnix(event.created_at_ts),
    rawPayloadJson: event.raw_payload_json
  });
  logger.info("message inserted", { sessionUid, messageOrder, ...ctx });

  // ── 7. active workflow 解決 ──────────────────────────────────────────────
  //
  // v2 intents_config / policy_config / source_config を含む全設定を取得する。
  // カテゴリ判定・エスカレーション判定よりも先に解決することで、
  // workflow v2 の escalation_keywords / slot 定義を以降の全ステップで利用できる。
  //
  let activeWorkflowRecord = null;
  let workflowOverrides = {
    skillConfig:   { version: 1, category_skill_order: {} },
    handoffConfig: { version: 1, global_preset: "balanced", category_presets: {} },
    policyConfig:  { version: 1, escalation_keywords: [], handoff_eagerness: "normal" },
    sourceConfig:  { version: 1, allowed: ["help_center", "notion_faq", "known_issue"], priority: ["notion_faq", "help_center", "known_issue"] },
    intentsConfig: { version: 1, intents: {} },
    workflowKey:   null,
    workflowSource: "fallback"
  };

  try {
    activeWorkflowRecord = await getActiveWorkflow(null);
    workflowOverrides = parseWorkflowOverrides(activeWorkflowRecord);
  } catch (err) {
    logger.warn("workflow resolution failed, using system defaults", {
      sessionUid,
      error: err?.message,
      ...ctx
    });
  }

  // workflow v2 policy: escalation_keywords が設定されていれば上書きする
  const workflowEscalationKeywords = resolveEscalationKeywords(workflowOverrides.policyConfig);

  logger.info("workflow resolved", {
    sessionUid,
    workflow_key:             workflowOverrides.workflowKey ?? null,
    workflow_source:          workflowOverrides.workflowSource,
    workflow_status:          activeWorkflowRecord?.status ?? null,
    has_skill_override:       Object.keys(workflowOverrides.skillConfig?.category_skill_order ?? {}).length > 0,
    has_intents_override:     Object.keys(workflowOverrides.intentsConfig?.intents ?? {}).length > 0,
    has_policy_override:      workflowEscalationKeywords.length > 0,
    global_handoff_preset:    workflowOverrides.handoffConfig?.global_preset ?? "balanced",
    ...ctx
  });

  // ── 7b. カテゴリ判定 (category が未設定の session のみ) ──────────────────
  if (!session.category) {
    const { category } = await runClassification(event.latest_user_message, { sessionUid, ...ctx }, workflowOverrides.intentsConfig);
    await updateSession(sessionRowId, { category });
    session = { ...session, category };

    // workflow v2 intents_config からカテゴリ別設定を取得してスロット初期化に渡す
    const intentInitOverride = resolveIntentConfig(workflowOverrides.intentsConfig, category);
    await initRequiredSlots(sessionUid, category, ctx, intentInitOverride);
  }

  // workflow v2 intents_config から現カテゴリの設定を取得 (以降のステップ全体で使う)
  const intentOverride = resolveIntentConfig(workflowOverrides.intentsConfig, session.category);

  // ── 8. エスカレーション判定 (毎ターン実行) ──────────────────────────────
  // workflow v2 の escalation_keywords があればそれを優先する
  const shouldEscalate = checkEscalation(event.latest_user_message, workflowEscalationKeywords);
  const escalationReason = shouldEscalate
    ? resolveEscalationReason(event.latest_user_message, workflowEscalationKeywords)
    : null;

  if (shouldEscalate) {
    logger.info("escalation flagged", {
      sessionUid,
      category: session.category,
      should_escalate: true,
      escalation_reason: escalationReason,
      keyword_source: workflowEscalationKeywords.length > 0 ? "workflow_v2" : "system_default",
      ...ctx
    });
    logger.info("escalation reason resolved", {
      sessionUid,
      category: session.category,
      escalation_reason: escalationReason,
      ...ctx
    });
  }

  // concierge は後続の Step で解決するため、ここでは registry default をベースに workflow override のみ適用。
  // workflow v2 intents_config[category].skills が存在する場合はそれを skill order override として使う。
  let effectiveSkillConfig = workflowOverrides.skillConfig;
  if (intentOverride?.skills?.length > 0) {
    const intentSkillOrder = intentOverride.skills.map((s) => s.name);
    effectiveSkillConfig = {
      ...effectiveSkillConfig,
      category_skill_order: {
        ...effectiveSkillConfig.category_skill_order,
        [session.category]: intentSkillOrder  // intent 設定がスキル順序を上書き
      }
    };
  }

  const workflowSkillProfile = Object.keys(effectiveSkillConfig?.category_skill_order ?? {}).length > 0
    ? mergeWorkflowSkillProfile({ orderOverrides: {}, confidenceOverrides: {}, disabled: [] }, effectiveSkillConfig)
    : null;

  // workflow source_config_json → sourcePriorityProfile 形式に変換してスキルに渡す
  const workflowSourceProfile = workflowOverrides.sourceConfig?.allowed?.length > 0
    ? { allowedSources: workflowOverrides.sourceConfig.allowed }
    : null;

  // ── 9. slot 抽出 ─────────────────────────────────────────────────────────
  // handed_off 後も slot の保存は継続する
  // workflow v2 intents_config[category].slots があればそれを使う
  if (config.llm.apiKey && session.category) {
    await runSlotExtraction(sessionUid, session.category, event.latest_user_message, ctx, intentOverride);
  } else if (!config.llm.apiKey) {
    logger.info("slot extraction skipped (LLM_API_KEY not set)", { sessionUid, category: session.category, ...ctx });
  }

  // ── 9b. handoff 判定 + slots 状態集計 ─────────
  //
  // knowledge-first intents (usage_guidance / experience_issue) の特別処理:
  //   handoff 条件を満たしても、まず knowledge skill を試す。
  //   skill が回答できた → handoff しない (status=collecting のまま)
  //   skill が回答できなかった → Step 9.6 で handoff に確定する
  //
  let filledSlotsCount = 0;
  let filledSlotNames = [];
  let missingSlotNames = [];
  let handoffReason = null;
  let allSlots = [];  // Step 9.5 でも再利用する
  let handoffDeferredForSkill = false;  // knowledge-first: skill 評価後に handoff 確定

  if (config.nocodb.tables.slots && session.category) {
    allSlots = await listSlotsBySessionUid(sessionUid);
    const filledSlots = allSlots.filter(isFilledSlot);
    filledSlotsCount = filledSlots.length;
    filledSlotNames = filledSlots.map((s) => s.slot_name);
    missingSlotNames = allSlots
      .filter((s) => s.is_required && !isFilledSlot(s))
      .map((s) => s.slot_name);

    logger.info("handoff readiness evaluated", {
      sessionUid,
      category: session.category,
      status: currentStatus,
      filled_slots_count: filledSlotsCount,
      filled_slots: filledSlotNames,
      missing_slots_count: missingSlotNames.length,
      missing_slots: missingSlotNames,
      ...ctx
    });

    if (currentStatus === "collecting") {
      // workflow v2 intents_config[category].handoff.preset があればそれを優先、なければ handoff_config から解決
      const handoffPreset = intentOverride?.handoff?.preset
        ?? resolveHandoffPreset(workflowOverrides.handoffConfig, session.category);
      // workflow v2 intents_config[category].handoff.required/any_of があれば条件オーバーライドとして渡す
      const handoffConditionOverride = (intentOverride?.handoff?.required || intentOverride?.handoff?.any_of)
        ? { required: intentOverride.handoff.required ?? [], any_of: intentOverride.handoff.any_of ?? [] }
        : null;
      const ready = isReadyForHandoff(session.category, allSlots, handoffPreset, handoffConditionOverride);
      if (ready) {
        handoffReason = resolveHandoffReason(session.category, allSlots);

        if (KNOWLEDGE_FIRST_CATEGORIES.has(session.category) || intentOverride?.skills?.length > 0) {
          // knowledge-first または workflow でスキルが設定されているカテゴリ: skill を試してから handoff 判断する
          handoffDeferredForSkill = true;
          logger.info("handoff deferred for knowledge skill evaluation", {
            sessionUid,
            category: session.category,
            filled_slots: filledSlotNames,
            missing_slots: missingSlotNames,
            handoff_reason: handoffReason,
            ...ctx
          });
        } else {
          currentStatus = "ready_for_handoff";
          await updateSession(sessionRowId, { status: currentStatus, shouldEscalate });
          logger.info("ready for handoff", {
            sessionUid,
            category: session.category,
            filled_slots_count: filledSlotsCount,
            missing_slots_count: missingSlotNames.length,
            handoff_reason: handoffReason,
            ...ctx
          });
          logger.info("handoff reason resolved", {
            sessionUid,
            category: session.category,
            handoff_reason: handoffReason,
            ...ctx
          });
        }
      }
    }

    logger.info("session status updated", {
      sessionUid,
      category: session.category,
      status: currentStatus,
      filled_slots_count: filledSlotsCount,
      ...ctx
    });
  }

  // ── 9.5. skill orchestration ──────────────────────────────────────
  //
  // 実行条件:
  //   通常 intent:        currentStatus === "collecting" のときのみ
  //   knowledge-first:   handoffDeferredForSkill === true のとき「も」実行する
  //                      (handoff 確定前に skill を試す)
  //
  // 可視化ログ:
  //   [knowledge skill evaluation started]   — skill を試す前
  //   [knowledge skill evaluation finished]  — skill 試行後 (selected_skill / reply_source 付き)
  //   [knowledge skill evaluation skipped due to handoff] — 非 knowledge-first が handoff 状態
  //
  let skillResult = null;

  const shouldRunSkillOrchestration = (
    (currentStatus === "collecting" || handoffDeferredForSkill) &&
    !shouldEscalate &&
    session.category &&
    config.llm.apiKey
  );

  if (shouldRunSkillOrchestration) {
    logger.info("knowledge skill evaluation started", {
      sessionUid,
      category: session.category,
      filled_slots: filledSlotNames,
      missing_slots: missingSlotNames,
      handoff_deferred: handoffDeferredForSkill,
      handoff_reason: handoffDeferredForSkill ? handoffReason : null,
      ...ctx
    });

    try {
      const collectedSlots = Object.fromEntries(
        allSlots.filter(isFilledSlot).map((s) => [s.slot_name, s.slot_value])
      );

      skillResult = await runSkillOrchestration({
        category:     session.category,
        latestUserMessage: event.latest_user_message,
        collectedSlots,
        skillProfile:        workflowSkillProfile,       // workflow override (null = registry default)
        workflowSourceProfile,                           // workflow source_config_json → allowedSources
        ctx: { sessionUid, ...ctx }
      });
    } catch (err) {
      logger.warn("skill orchestration error, continuing with normal flow", {
        sessionUid,
        category: session.category,
        error: err?.message,
        ...ctx
      });
    }

    const skillReplySource = skillResult?.handled
      ? (skillResult?.answer_type ?? "skill")
      : (handoffDeferredForSkill ? "handoff_pending" : "next_message");

    logger.info("knowledge skill evaluation finished", {
      sessionUid,
      category: session.category,
      filled_slots: filledSlotNames,
      missing_slots: missingSlotNames,
      selected_skill: skillResult?.selected_skill ?? null,
      skill_handled: skillResult?.handled ?? false,
      reply_source: skillReplySource,
      handoff_reason: handoffDeferredForSkill ? handoffReason : null,
      ...ctx
    });
  } else if (KNOWLEDGE_FIRST_CATEGORIES.has(session.category) && currentStatus === "ready_for_handoff") {
    // knowledge-first intent が前ターンで already ready_for_handoff 状態 → ログのみ
    logger.info("knowledge skill evaluation skipped due to handoff", {
      sessionUid,
      category: session.category,
      filled_slots: filledSlotNames,
      missing_slots: missingSlotNames,
      selected_skill: null,
      reply_source: "handoff",
      handoff_reason: handoffReason,
      ...ctx
    });
  }

  // ── 9.6. knowledge-first handoff 確定 ─────────────────────────────
  //
  // handoffDeferredForSkill=true かつ skill が回答できなかった場合:
  //   → handoff に確定して session status を更新する
  //
  // skill が回答できた場合:
  //   → status は "collecting" のまま。次ターンも skill を優先する。
  //
  if (handoffDeferredForSkill && !(skillResult?.handled)) {
    currentStatus = "ready_for_handoff";
    await updateSession(sessionRowId, { status: currentStatus, shouldEscalate });
    logger.info("ready for handoff", {
      sessionUid,
      category: session.category,
      filled_slots_count: filledSlotsCount,
      missing_slots_count: missingSlotNames.length,
      handoff_reason: handoffReason,
      skill_tried: true,
      ...ctx
    });
    logger.info("handoff reason resolved", {
      sessionUid,
      category: session.category,
      handoff_reason: handoffReason,
      ...ctx
    });
  }

  // ── 10. 次質問生成 / answer_candidate_json 組み立て ──────────────────
  //
  // 保存方針:
  //   collecting       → skill 採用 or 次質問生成 のどちらかで必ず生成・保存
  //   ready_for_handoff → handoff メタデータを保存 (obsBase を含む)
  //   handed_off       → 保存しない (前 turn の値を維持)
  //   escalation       → collecting と同フローで生成される (shouldEscalate フラグ付き)
  //
  // ENABLE_INTERCOM_REPLY=false でも保存する。
  // reply 実行可否に依存させない。
  //
  let answerCandidateJson = null;
  let replySourceCandidate = null;

  // 観測フィールド (全ルートで共通)
  const obsBase = {
    filled_slots: filledSlotNames,
    missing_slots: missingSlotNames,
    filled_slots_count: filledSlotsCount,
    missing_slots_count: missingSlotNames.length,
    handoff_reason: handoffReason,
    escalation_reason: escalationReason,
    selected_skill: skillResult?.selected_skill ?? null,
    skill_candidates: skillResult?.candidate_results ?? []
  };

  // persistCtx: 保存ログに session_uid と conversation_id を含める
  const persistCtx = {
    session_uid: sessionUid,
    conversation_id: event.intercom_conversation_id,
    category: session.category
  };

  if (currentStatus === "handed_off") {
    logger.info("session already handed_off", {
      sessionUid,
      category: session.category,
      status: currentStatus,
      ...ctx
    });

  } else if (currentStatus === "collecting") {
    if (skillResult?.handled) {
      // skill orchestration で採用結果が出た場合
      replySourceCandidate = skillResult.answer_type;
      // 採用 skill の answer_candidate_json から retrieval_query / candidate_titles を展開
      let skillCandidateDetail = {};
      try {
        if (skillResult.answer_candidate_json) {
          skillCandidateDetail = JSON.parse(skillResult.answer_candidate_json);
        }
      } catch { /* JSON parse 失敗は無視 */ }
      answerCandidateJson = JSON.stringify({
        answer_type: skillResult.answer_type,
        answer_message: skillResult.answer_message,
        sources: skillResult.sources ?? [],
        confidence: skillResult.confidence,
        reason: skillResult.reason,
        retrieval_query: skillCandidateDetail.retrieval_query ?? null,
        candidate_titles: skillCandidateDetail.candidate_titles ?? null,
        candidate_chunk_ids: skillCandidateDetail.candidate_chunk_ids ?? null,
        ask_slots: [],
        next_message: null,
        should_escalate: shouldEscalate,
        reply_source_candidate: replySourceCandidate,
        ...obsBase
      });
    } else if (skillResult?.soft_handled && skillResult?.soft_answer_message) {
      // soft answer: 低信頼度の部分回答 + スロット質問を組み合わせる
      replySourceCandidate = "soft_answer";
      answerCandidateJson = JSON.stringify({
        answer_type: "soft_answer",
        answer_message: skillResult.soft_answer_message,
        sources: [],
        confidence: skillResult.soft_confidence ?? 0,
        selected_skill: skillResult.selected_skill ?? null,
        ask_slots: [],
        next_message: null,
        should_escalate: shouldEscalate,
        reply_source_candidate: replySourceCandidate,
        ...obsBase
      });
    } else {
      // 次質問生成 (skill 不採用またはカテゴリに skill なし)
      try {
        const isFirstContact = messageOrder === 1 && ["experience_issue", "bug_report"].includes(session.category);
        const { candidateData } = await runNextQuestionGeneration(
          sessionUid, session, event.latest_user_message, shouldEscalate, allSlots, ctx, intentOverride,
          event.author_name || null, isFirstContact
        );
        if (candidateData) {
          replySourceCandidate = "next_message";
          answerCandidateJson = JSON.stringify({
            answer_type: null,
            answer_message: null,
            sources: [],
            confidence: null,
            ...candidateData,
            reply_source_candidate: replySourceCandidate,
            ...obsBase
          });
        }
      } catch (err) {
        logger.warn("next question generation error, continuing with fallback reply", {
          sessionUid,
          error: err?.message,
          ...ctx
        });
      }
    }

  } else if (currentStatus === "ready_for_handoff") {
    // handoff メタデータを answer_candidate_json に保存する
    replySourceCandidate = "handoff";
    answerCandidateJson = JSON.stringify({
      answer_type: null,
      answer_message: null,
      sources: [],
      confidence: null,
      ask_slots: [],
      next_message: null,
      should_escalate: shouldEscalate,
      reply_source_candidate: replySourceCandidate,
      ...obsBase
    });
  }

  // answer_candidate_json を保存 (collecting / ready_for_handoff)
  // - try-catch は persistSessionFields 内で行う
  // - reply 実行の可否に依存しない
  if (answerCandidateJson !== null) {
    await persistSessionFields(sessionRowId, { answerCandidateJson, shouldEscalate }, persistCtx);
  }

  // ── 11. reply 文面決定 → Intercom 送信 ─────
  const { replyMessage, replySource } = resolveReplyMessage({
    answerCandidateJson,
    shouldEscalate,
    status: currentStatus,
    authorName: event.author_name || null
  });

  const decisionTrace = buildDecisionTrace({
    shouldEscalate,
    status: currentStatus,
    selectedSkill: skillResult?.selected_skill ?? null,
    skillAccepted: skillResult?.handled ?? false,
    replySource
  });

  let askSlotsForLog = [];
  try {
    const cand = typeof answerCandidateJson === "string" ? JSON.parse(answerCandidateJson) : answerCandidateJson;
    askSlotsForLog = cand?.ask_slots ?? [];
  } catch {}

  logger.info("reply resolution trace", {
    sessionUid,
    category: session.category,
    should_escalate: shouldEscalate,
    status: currentStatus,
    selected_skill: skillResult?.selected_skill ?? null,
    reply_source: replySource,
    filled_slots_count: filledSlotsCount,
    missing_slots_count: missingSlotNames.length,
    decision_trace: decisionTrace,
    escalation_reason: escalationReason,
    handoff_reason: handoffReason,
    ...ctx
  });

  logger.info("reply message resolved", {
    sessionUid,
    category: session.category,
    should_escalate: shouldEscalate,
    status: currentStatus,
    ask_slots: askSlotsForLog,
    reply_source: replySource,
    filled_slots_count: filledSlotsCount,
    missing_slots_count: missingSlotNames.length,
    ...ctx
  });

  // final_summary_json の保存 (reply_source 確定後)
  //
  // 保存方針:
  //   - help_center_answer / next_message / handoff / escalation / already_handed_off
  //     どの reply_source でも必ず保存する
  //   - ENABLE_INTERCOM_REPLY=false でも保存する
  //   - persistSessionFields 内で try-catch するので bot 全体を落とさない
  //
  // handoff summary は handoff / escalation のときのみ生成する
  const needsHandoffSummary = replySource === "handoff" || replySource === "escalation";
  let handoffSummaryFields = {};
  if (needsHandoffSummary) {
    const summaryResult = await buildHandoffSummary({
      category: session.category,
      slots: allSlots,
      latestUserMessage: event.latest_user_message ?? null,
      shouldEscalate,
      replySource,
      ctx: persistCtx
    });
    handoffSummaryFields = {
      handoff_summary: summaryResult.handoff_summary,
      summary_version: summaryResult.summary_version,
      summary_for_agent: summaryResult.summary_for_agent
    };
  }

  const finalSummaryJson = JSON.stringify({
    category:            session.category,
    status:              currentStatus,
    latest_user_message: event.latest_user_message?.slice(0, 200) ?? null,
    selected_skill:      skillResult?.selected_skill ?? null,
    reply_source:        replySource,
    should_escalate:     shouldEscalate,
    filled_slots_count:  filledSlotsCount,
    missing_slots_count: missingSlotNames.length,
    decision_trace:      decisionTrace,
    workflow_key:           workflowOverrides.workflowKey ?? null,
    workflow_source:        workflowOverrides.workflowSource,
    handoff_preset_applied: intentOverride?.handoff?.preset ?? resolveHandoffPreset(workflowOverrides.handoffConfig, session.category),
    active_skill_order:     workflowSkillProfile?.orderOverrides?.[session.category] ?? null,
    intent_override_applied: intentOverride !== null,
    policy_override_applied: (workflowOverrides.policyConfig?.escalation_keywords?.length ?? 0) > 0,
    recorded_at:         new Date().toISOString(),
    ...handoffSummaryFields
  });

  // 個別フィールド同期: JSON と同じ UPDATE で sessions に保存する
  const obsFields = buildSessionObservabilityFields({
    answerCandidateJson,
    finalSummaryJson,
    category: session.category
  });
  logger.info("session observability fields prepared", {
    selected_skill: obsFields.selected_skill,
    reply_source: obsFields.reply_source,
    filled_slots_count: obsFields.filled_slots_count,
    missing_slots_count: obsFields.missing_slots_count,
    has_reply_preview: obsFields.reply_preview !== null,
    has_customer_intent_summary: obsFields.customer_intent_summary !== null,
    has_recommended_next_step: obsFields.recommended_next_step !== null,
    ...persistCtx
  });

  logger.info("session observability fields merged", persistCtx);
  await persistSessionFields(sessionRowId, { finalSummaryJson, observabilityFields: obsFields }, persistCtx);
  logger.info("session observability fields persisted", persistCtx);
  if (needsHandoffSummary) {
    logger.info("handoff summary persisted", { reply_source: replySource, ...persistCtx });
  }

  // handed_off → 追加返信しない
  if (replySource === "already_handed_off") {
    logger.info("reply skipped (already handed_off)", { sessionUid, reply_source: replySource, ...ctx });
    return;
  }

  // ── target 判定 + concierge 解決 ────────────────
  const guardCtx = {
    conversation_id: event.intercom_conversation_id,
    contact_id: event.intercom_contact_id ?? null,
    ...ctx
  };
  logger.info("test target evaluation started", guardCtx);

  const targeting = await resolveTargetAndConcierge({
    contactId: event.intercom_contact_id ?? null,
    conversationId: event.intercom_conversation_id
  });

  if (!targeting.allowed) {
    const skipMsg = targeting.reason === "reply_disabled"
      ? "reply skipped (reply disabled)"
      : "test target not matched";
    logger.info(skipMsg, {
      reason: targeting.reason,
      conversation_id: event.intercom_conversation_id,
      contact_id: event.intercom_contact_id ?? null,
      ...ctx
    });
    return;
  }

  logger.info("test target matched", {
    reason: targeting.reason,
    matched_type:  targeting.matchedType,
    matched_value: targeting.matchedValue,
    conversation_id: event.intercom_conversation_id,
    contact_id: event.intercom_contact_id ?? null,
    ...ctx
  });

  logger.info("concierge resolved", {
    concierge_key:    targeting.conciergeKey,
    concierge_name:   targeting.conciergeName,
    concierge_source: targeting.conciergeSource,
    ...ctx
  });

  // concierge + targeting 情報を session に保存
  if (sessionRowId) {
    try {
      await updateSession(sessionRowId, {
        observabilityFields: {
          concierge_key:       targeting.conciergeKey,
          concierge_name:      targeting.conciergeName,
          target_match_reason: targeting.targetMatchReason
        }
      });
    } catch (err) {
      logger.warn("targeting: session concierge update failed", {
        error: err?.message || String(err),
        ...ctx
      });
    }
  }

  const conciergeAdminId = targeting.concierge?.intercom_admin_id ?? null;
  const replyAdminId = conciergeAdminId || config.intercom.adminId;
  logger.info("reply admin resolved", {
    concierge_intercom_admin_id: conciergeAdminId,
    env_admin_id: config.intercom.adminId,
    using_admin_id: replyAdminId,
    ...ctx
  });
  try {
    await replyToConversation(event.intercom_conversation_id, replyMessage, replyAdminId);
    logger.info("reply success", { reply_source: replySource, admin_id: replyAdminId, category: session.category ?? null, concierge_key: targeting.conciergeKey ?? null, ...ctx });

    // handoff reply 成功 → handed_off に遷移
    if (replySource === "handoff") {
      await updateSession(sessionRowId, { status: "handed_off" });
      logger.info("session status updated", { sessionUid, status: "handed_off", ...ctx });
    }
  } catch (err) {
    logger.warn("reply failed", {
      reply_source: replySource,
      category: session.category ?? null,
      concierge_key: targeting.conciergeKey ?? null,
      error: err?.message || String(err),
      ...ctx
    });
  }
}
