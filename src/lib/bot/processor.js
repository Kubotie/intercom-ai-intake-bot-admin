import { extractIntercomEvent } from "./intercom-extract.js";
import {
  createMessage,
  createSession,
  createSlot,
  countMessagesBySessionUid,
  findMessageByIntercomMessageId,
  findSessionByConversationId,
  isDuplicateKeyError,
  listMessagesBySessionUid,
  listSlotsBySessionUid,
  updateSession,
  updateSlot
} from "./nocodb-repo.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { replyToConversation, addNoteToConversation } from "./intercom-api.js";
import { classifyCategory, extractSlots, generateNextQuestion } from "./llm.js";
import { CATEGORY_LIST, REQUIRED_SLOTS_BY_CATEGORY, SLOT_PRIORITY_BY_CATEGORY } from "./categories.js";
import { resolveReplyMessage } from "./reply-resolver.js";
import { isAllowedReplyTarget } from "./reply-guard.js";
import { resolveTargetAndConcierge } from "./targeting.js";
import { isReadyForHandoff, isReadyForHandoffNL, resolveHandoffReason } from "./handoff-guard.js";
import { getIntentNLInstruction, getClassifyConfig, getConciergeTools, getNlPolicyInstruction, getCategoryList } from "./workflow-config-loader.js";
import { extractImageAttachments, describeImages } from "./tools/image-reader.js";
import { loadPage, extractUrls } from "./tools/page-loader.js";
import { dbStatusToInternal, buildSessionObservabilityFields, validateSessionCreatePayload } from "./nocodb-mapper.js";
import { runSkillOrchestration } from "./skills/orchestrator.js";
import { buildHandoffSummary } from "./handoff-summary.js";
import { resolveExecutionProfile } from "./concierge-profiles.js";
import { enrichContactFromUrl } from "./project-enrichment.js";
import { runAgenticTroubleshootLoop } from "./agentic-slot-loop.js";
import { generateAnswerCandidatesForNote } from "./note-candidates.js";

// ─────────────────────────────────────────────
// self-reply loop prevention (2段構え)
// ─────────────────────────────────────────────
const USER_TOPICS = new Set(["conversation.user.created", "conversation.user.replied"]);

// LLM 未設定または分類失敗時のデフォルトカテゴリ
const FALLBACK_CATEGORY = "usage_guidance";

// knowledge-first intents: handoff より前に FAQ / Help Center skill を試す
// これらは情報収集よりも「答えを出す」ことが優先される intent
const KNOWLEDGE_FIRST_CATEGORIES = new Set(["usage_guidance", "ab_test_experience", "heatmap_analytics", "popup_event", "customization_integration", "report_difference"]);

// エスカレーション判定キーワードのデフォルト値。
// 実行時は executionProfile.policyProfile.escalationKeywords で上書きされる。
// 「解約」は billing_contract での structured handoff で対応するため除外。
const DEFAULT_ESCALATION_KEYWORDS = ["至急", "緊急", "全く使えない", "障害", "返金", "全員使えない", "全社員", "本番が止まっている"];

// トピック変更シグナル: ユーザーが別件に切り替えたことを示す表現
const TOPIC_CHANGE_SIGNALS = [
  "別件で", "別件ですが", "別の件で", "別の件ですが",
  "別の質問", "別の相談", "違う件", "異なる件",
  "別のことで", "新しい質問", "話が変わります",
  "actually,", "by the way,",
];

function hasSwitchSignal(message) {
  const lower = message.toLowerCase();
  return TOPIC_CHANGE_SIGNALS.some(s => lower.includes(s.toLowerCase()));
}

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
// keywords は executionProfile.policyProfile.escalationKeywords を渡す。
// 未指定時は DEFAULT_ESCALATION_KEYWORDS を使う。
// ─────────────────────────────────────────────
function checkEscalation(message, keywords = DEFAULT_ESCALATION_KEYWORDS) {
  return keywords.some((kw) => message.includes(kw));
}

function resolveEscalationReason(message, keywords = DEFAULT_ESCALATION_KEYWORDS) {
  const triggered = keywords.filter((kw) => message.includes(kw));
  if (triggered.length === 0) return null;
  return triggered.map((kw) => `keyword:${kw}`).join(", ");
}

// ─────────────────────────────────────────────
// メッセージ内容判定（note 候補生成のスキップ制御）
// ─────────────────────────────────────────────

/** 締め言葉（クロージング）判定 */
function isClosingMessage(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  if (/[?？]|でしょうか|ですか|教えて|確認し|どのよう/.test(clean)) return false;
  if (/^(解消|解決)(し(まし)?た|です)[。！\s]*$/.test(clean)) return true;
  if (/ありがとうございまし?た/.test(clean)) return true;
  return false;
}

/** セッション全ユーザーメッセージを結合してnote候補用クエリを組み立てる */
async function buildNoteQueryContext(sessionUid, latestUserMessage) {
  try {
    const msgs = await listMessagesBySessionUid(sessionUid, 20);
    const userTexts = msgs
      .filter(m => m.role === "user")
      .sort((a, b) => (a.message_order ?? 0) - (b.message_order ?? 0))
      .map(m => String(m.message_text ?? "").trim())
      .filter(t => t.length > 3);
    return userTexts.length > 0 ? userTexts.join("\n") : latestUserMessage;
  } catch {
    return latestUserMessage;
  }
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
async function runClassification(latestUserMessage, ctx) {
  if (!config.llm.apiKey) {
    logger.info("category fallback used (LLM_API_KEY not set)", { category: FALLBACK_CATEGORY, confidence: 0, ...ctx });
    return { category: FALLBACK_CATEGORY, confidence: 0, reason: "LLM_API_KEY not configured", actionIntent: "troubleshoot", urgency: "normal", sentiment: "neutral" };
  }

  // ワークフロー設定から動的カテゴリ定義を取得 (未設定なら null → 静的プロンプトにフォールバック)
  const [categoryDefinitions, dynamicCategoryList] = await Promise.all([
    getClassifyConfig().catch(() => null),
    getCategoryList().catch(() => CATEGORY_LIST),
  ]);
  const classifySource = categoryDefinitions ? "workflow_config" : "static_prompt";

  logger.info("category classification started", { ...ctx, classify_source: classifySource, category_count: dynamicCategoryList.length });
  try {
    const result = await classifyCategory({ latestUserMessage, categoryCandidates: dynamicCategoryList, categoryDefinitions });
    const category = dynamicCategoryList.includes(result.category) ? result.category : FALLBACK_CATEGORY;
    const confidence = result.confidence ?? 0;
    const reason = result.reason ?? "";
    const actionIntent = ["troubleshoot", "learn", "verify", "request"].includes(result.action_intent)
      ? result.action_intent
      : "troubleshoot";
    const urgency = result.urgency === "high" ? "high" : "normal";
    const sentiment = ["frustrated", "neutral", "positive"].includes(result.sentiment)
      ? result.sentiment
      : "neutral";
    if (category !== result.category) {
      logger.info("category fallback used (unknown category from LLM)", { category, rawCategory: result.category, confidence, classify_source: classifySource, ...ctx });
    } else {
      logger.info("category classified", { category, confidence, reason, action_intent: actionIntent, urgency, sentiment, classify_source: classifySource, ...ctx });
    }
    return { category, confidence, reason, actionIntent, urgency, sentiment };
  } catch (err) {
    logger.warn("category classification failed, using fallback", { error: err?.message, ...ctx });
    logger.info("category fallback used", { category: FALLBACK_CATEGORY, confidence: 0, ...ctx });
    return { category: FALLBACK_CATEGORY, confidence: 0, reason: `classification error: ${err?.message}`, actionIntent: "troubleshoot", urgency: "normal", sentiment: "neutral" };
  }
}

// ─────────────────────────────────────────────
// required slots 初期投入 (重複スキップ付き)
// ─────────────────────────────────────────────
async function initRequiredSlots(sessionUid, category, ctx) {
  if (!config.nocodb.tables.slots) {
    logger.warn("NOCODB_SLOTS_TABLE_ID not set, skipping slot init", { sessionUid, category });
    return;
  }

  const required = REQUIRED_SLOTS_BY_CATEGORY[category] || [];
  if (required.length === 0) return;

  const existing = await listSlotsBySessionUid(sessionUid);
  const existingByName = Object.fromEntries(existing.map((s) => [s.slot_name, s]));

  let created = 0;
  let reactivated = 0;

  for (const slotName of required) {
    if (existingByName[slotName]) {
      // カテゴリ切り替え後の再アクティブ化: is_required を true に戻す（値は保持）
      await updateSlot(existingByName[slotName].Id, { isRequired: true });
      reactivated++;
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
    reactivated,
    ...ctx
  });
}

// ─────────────────────────────────────────────
// slot 抽出: latest_user_message から required slots を埋める
// ─────────────────────────────────────────────
async function runSlotExtraction(sessionUid, category, latestUserMessage, ctx) {
  if (!config.nocodb.tables.slots) return;

  const requiredSlots = REQUIRED_SLOTS_BY_CATEGORY[category] || [];
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
function selectAskSlots(category, slots) {
  const priority = SLOT_PRIORITY_BY_CATEGORY[category] || REQUIRED_SLOTS_BY_CATEGORY[category] || [];
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
// soft answer + スロット質問の結合メッセージを生成
//
// 部分回答（confidence 0.45〜0.64）の末尾締め文を除去し、
// 追加で必要なスロット質問を挿入して再度締め文を付与する。
// ─────────────────────────────────────────────
const SOFT_ANSWER_CLOSINGS = [
  "引き続き何かございましたらお気軽にご相談くださいませ。",
  "引き続きよろしくお願い申し上げます。"
];

function buildSoftAnswerMessage(softAnswerText, askSlots) {
  let base = (softAnswerText || "").trim();
  let detectedClosing = "引き続きよろしくお願い申し上げます。";

  for (const closing of SOFT_ANSWER_CLOSINGS) {
    if (base.endsWith(closing)) {
      base = base.slice(0, -closing.length).trimEnd();
      detectedClosing = closing === "引き続き何かございましたらお気軽にご相談くださいませ。"
        ? "引き続きよろしくお願い申し上げます。"
        : closing;
      break;
    }
  }

  if (askSlots.length === 0) {
    return `${base}\n\n${detectedClosing}`;
  }

  const slotLines = askSlots.map((s) => `・${SLOT_LABELS[s] || s}`).join("\n");
  return `${base}\n\nなお、より詳しい確認のため、以下の情報をお教えいただけますでしょうか？\n${slotLines}\n\n${detectedClosing}`;
}

// ─────────────────────────────────────────────
// 次質問候補の生成 (DB 保存は processor が行う)
// (status=collecting のときのみ呼ばれる)
// shouldEscalate は主フローで判定済みのものを受け取る
// ─────────────────────────────────────────────
async function runNextQuestionGeneration(sessionUid, session, latestUserMessage, shouldEscalate, slots, ctx, authorName, isFirstContact = false, nlInstruction = null, toolContext = {}, globalPolicyInstruction = null, conversationHistorySummary = null) {
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

  const askSlots = selectAskSlots(category, slots);
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
        nlInstruction: nlInstruction || null,
        globalPolicyInstruction: globalPolicyInstruction || null,
        requiredSlots: REQUIRED_SLOTS_BY_CATEGORY[category] || [],
        collectedSlots,
        askSlots,
        latestUserMessage,
        customerName: authorName || null,
        isFirstContact: isFirstContact || false,
        conversationHistorySummary: conversationHistorySummary ?? null,
        escalationSignals: [],
        imageDescriptions: toolContext.imageDescriptions ?? null,
        urlContext: toolContext.urlContext ?? null,
        allowImageMarkdown: toolContext.allowImageMarkdown ?? false,
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

  // ── 4. 重複チェックは Step 6 の createMessage で UNIQUE 制約によりアトミックに行う ──

  // ── 4.5. project enrichment (conversation.user.created のみ) ──────────
  // source.url から Ptengine project_id を抽出し、
  // Metabase CSV を参照してコンタクトの Session_Package_type / Session_Project_domain を更新する。
  // 失敗しても後続処理には影響しない。
  let enrichedAttrs = null;
  if (event.event_topic === "conversation.user.created" && event.intercom_contact_id) {
    const sourceUrl = rawSrc?.url ?? null;
    logger.info("project-enrichment: source url", { sourceUrl, contact_id: event.intercom_contact_id, ...ctx });
    if (sourceUrl) {
      enrichedAttrs = await enrichContactFromUrl(event.intercom_contact_id, sourceUrl).catch(err => {
        logger.warn("project-enrichment failed (non-fatal)", { error: err?.message, ...ctx });
        return null;
      });
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
      conversation_id: event.intercom_conversation_id,
    });
    return;
  }

  // ── 5.5. 早期 concierge 解決 + execution profile 確定 ──────────────
  //
  // targeting (test target 判定 + concierge 解決) をここで実行し、
  // executionProfile を確定する。
  //
  // executionProfile は以降の全ステップで参照される:
  //   - Step 8:  escalation keywords (policyProfile)
  //   - Step 9.5: skill 実行順・confidence threshold (skillProfile)
  //   - Step 12: reply 可否の判断 (targeting.allowed) — 同じ targeting 結果を再利用
  //
  // targeting.allowed === false の場合でも processing は続行し、
  // Step 12 で reply だけスキップする。
  //
  const targeting = await resolveTargetAndConcierge({
    contactId:      event.intercom_contact_id ?? null,
    conversationId: event.intercom_conversation_id,
    contactEmail:   event.intercom_contact_email ?? null,
    contactPlan:    enrichedAttrs?.Session_Package_type ?? null,
    contactDomain:  enrichedAttrs?.Session_Project_domain ?? null,
  });
  const executionProfile = resolveExecutionProfile(targeting.concierge);

  logger.info("concierge resolved", {
    concierge_key:                targeting.conciergeKey,
    concierge_name:               targeting.conciergeName,
    concierge_source:             targeting.conciergeSource,
    policy_profile_key:           executionProfile.policyProfileKey,
    skill_profile_key:            executionProfile.skillProfileKey,
    source_priority_profile_key:  executionProfile.sourcePriorityProfileKey,
    ...ctx
  });

  // concierge + profile 情報を session に早期保存
  try {
    await updateSession(sessionRowId, {
      observabilityFields: {
        concierge_key:                targeting.conciergeKey,
        concierge_name:               targeting.conciergeName,
        target_match_reason:          targeting.targetMatchReason,
        policy_set_key:               executionProfile.policyProfileKey,
        skill_profile_key:            executionProfile.skillProfileKey,
        source_priority_profile_key:  executionProfile.sourcePriorityProfileKey,
      }
    });
  } catch (err) {
    logger.warn("concierge profile session save failed (non-fatal)", {
      error: err?.message || String(err), ...ctx
    });
  }

  // ── 6. message 保存 ─────────────────────────
  const messageOrder = (await countMessagesBySessionUid(sessionUid)) + 1;
  try {
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
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      logger.info("duplicate message skipped (unique constraint)", {
        ...ctx,
        is_retry_candidate: event.event_topic === "conversation.user.created"
      });
      return;
    }
    throw err;
  }

  // ── 6.3. デバウンス: bot 未返信の連続メッセージを結合してから処理する ──
  //
  // ユーザーが意図を複数メッセージに分けて送信した場合（例: 前提1件 + 質問1件）に
  // 正確な意図把握ができないため、一定時間待機して後続メッセージと結合する。
  //
  // アルゴリズム:
  //   1. DEBOUNCE_WAIT_MS 待機（後続メッセージが NocoDB に保存されるのを待つ）
  //   2. セッションの全メッセージを再取得し「bot返信なしの連続ユーザーメッセージ」を検出
  //   3. 現在のメッセージが最新でなければ → yield して重複処理を防ぐ
  //   4. 最新かつバッチが2件以上 → event.latest_user_message を結合メッセージで上書き
  //
  const DEBOUNCE_WAIT_MS = 4000;
  await new Promise(resolve => setTimeout(resolve, DEBOUNCE_WAIT_MS));

  try {
    const sessionMsgs = await listMessagesBySessionUid(sessionUid, 30);
    const userMsgs = sessionMsgs
      .filter(m => m.role === "user")
      .sort((a, b) => (a.message_order ?? 0) - (b.message_order ?? 0));

    // このメッセージが最新でなければ、新しいメッセージの処理に任せて終了する
    const latestUserMsg = userMsgs[userMsgs.length - 1];
    if (latestUserMsg?.intercom_message_id !== event.intercom_message_id) {
      logger.info("debounce: yielding to newer message", {
        this_order:   messageOrder,
        latest_order: latestUserMsg?.message_order,
        ...ctx
      });
      return;
    }

    // 最後の bot 返信以降に届いたユーザーメッセージ群を特定する
    const botOrders = sessionMsgs
      .filter(m => m.role === "bot")
      .map(m => m.message_order ?? 0);
    const lastBotOrder = botOrders.length > 0 ? Math.max(...botOrders) : 0;
    const batchMsgs = userMsgs.filter(m => (m.message_order ?? 0) > lastBotOrder);

    if (batchMsgs.length > 1) {
      const combined = batchMsgs
        .map(m => String(m.message_text ?? "").trim())
        .filter(Boolean)
        .join("\n");
      logger.info("debounce: combined consecutive messages", {
        batch_size:      batchMsgs.length,
        last_bot_order:  lastBotOrder,
        combined_length: combined.length,
        ...ctx
      });
      // 以降の LLM 処理がすべて結合メッセージを参照するよう in-place 上書きする
      event.latest_user_message = combined;
    }
  } catch (err) {
    logger.warn("debounce batch detection failed (non-fatal)", { error: err?.message, ...ctx });
  }

  // ── 6.5. 会話履歴サマリー構築 ─────────────────────────────────────
  // 直近 5 件のユーザーメッセージ（今回分を除く）を LLM コンテキスト用に整形する。
  let conversationHistorySummary = null;
  if (messageOrder > 1) {
    try {
      const allMsgs = await listMessagesBySessionUid(sessionUid, 10);
      const prevMsgs = allMsgs
        .filter(m => m.intercom_message_id !== event.intercom_message_id)
        .slice(-5);
      if (prevMsgs.length > 0) {
        conversationHistorySummary = prevMsgs
          .map(m => {
            const role = m.role === "bot" ? "Bot" : "ユーザー";
            return `${role}: ${String(m.message_text ?? "").slice(0, 300)}`;
          })
          .join("\n");
      }
    } catch (err) {
      logger.warn("conversation history retrieval failed (non-fatal)", { sessionUid, error: err?.message, ...ctx });
    }
  }

  // ── 7. カテゴリ判定 + 多次元意図分類 ─────────────────────────────────
  // actionIntent / urgency / sentiment はターンごとに再判定する。
  // NocoDB への保存は observabilityFields 経由（Step 10 の persistSessionFields で保存）。
  let actionIntent = "troubleshoot"; // デフォルト
  let urgency      = "normal";
  let sentiment    = "neutral";

  if (!session.category) {
    // 初回メッセージ: 分類して設定
    const result = await runClassification(event.latest_user_message, { sessionUid, ...ctx });
    actionIntent = result.actionIntent;
    urgency      = result.urgency;
    sentiment    = result.sentiment;
    await updateSession(sessionRowId, {
      category: result.category,
      observabilityFields: { action_intent: actionIntent, urgency, sentiment }
    });
    session = { ...session, category: result.category };
    // learn は症状スロット不要 → initRequiredSlots をスキップ
    if (actionIntent !== "learn") {
      await initRequiredSlots(sessionUid, result.category, ctx);
    }
  } else if (currentStatus === "handed_off") {
    // ハンドオフ後に新たなメッセージが届いた: 新規問い合わせとしてリセット
    logger.info("post-handoff new message — resetting session", { sessionUid, ...ctx });
    const result = await runClassification(
      event.latest_user_message, { sessionUid, post_handoff_reset: true, ...ctx }
    );
    actionIntent = result.actionIntent;
    urgency      = result.urgency;
    sentiment    = result.sentiment;
    // 既存 required slots を非必須化
    const existingSlots = await listSlotsBySessionUid(sessionUid);
    for (const slot of existingSlots.filter(s => s.is_required)) {
      await updateSlot(slot.Id, { isRequired: false });
    }
    await updateSession(sessionRowId, {
      category: result.category,
      status: "collecting",
      observabilityFields: { action_intent: actionIntent, urgency, sentiment }
    });
    session       = { ...session, category: result.category };
    currentStatus = "collecting";
    if (actionIntent !== "learn") {
      await initRequiredSlots(sessionUid, result.category, ctx);
    }
  } else if (messageOrder > 1 && hasSwitchSignal(event.latest_user_message)) {
    // 2ターン目以降でトピック変更シグナルを検知: 再分類してカテゴリ切り替えを試みる
    const result = await runClassification(
      event.latest_user_message, { sessionUid, topic_change_check: true, ...ctx }
    );
    actionIntent = result.actionIntent;
    urgency      = result.urgency;
    sentiment    = result.sentiment;
    if (result.category && result.category !== session.category && result.confidence >= 0.7) {
      logger.info("topic change detected — switching category", {
        sessionUid,
        previous_category: session.category,
        new_category:      result.category,
        confidence:        result.confidence,
        ...ctx
      });
      // 既存 required slots を非必須化（旧カテゴリのスロットが handoff 判定に混入しないよう）
      const existingSlots = await listSlotsBySessionUid(sessionUid);
      for (const slot of existingSlots.filter(s => s.is_required)) {
        await updateSlot(slot.Id, { isRequired: false });
      }
      await updateSession(sessionRowId, {
        category: result.category,
        status: "collecting",
        observabilityFields: { action_intent: actionIntent, urgency, sentiment }
      });
      session      = { ...session, category: result.category };
      currentStatus = "collecting";
      if (actionIntent !== "learn") {
        await initRequiredSlots(sessionUid, result.category, ctx);
      }
    } else {
      // カテゴリ変更なし: action_intent / urgency / sentiment だけ更新
      await updateSession(sessionRowId, {
        observabilityFields: { action_intent: actionIntent, urgency, sentiment }
      });
    }
  } else {
    // 通常の継続ターン: 毎ターン分類を実行し、カテゴリが変わっていればトピック切替も行う
    const result = await runClassification(
      event.latest_user_message, { sessionUid, continuing_turn: true, ...ctx }
    );
    actionIntent = result.actionIntent;
    urgency      = result.urgency;
    sentiment    = result.sentiment;
    if (result.category && result.category !== session.category && result.confidence >= 0.75) {
      logger.info("topic change detected via classification (no keyword) — switching category", {
        sessionUid,
        previous_category: session.category,
        new_category:      result.category,
        confidence:        result.confidence,
        ...ctx
      });
      const existingSlots = await listSlotsBySessionUid(sessionUid);
      for (const slot of existingSlots.filter(s => s.is_required)) {
        await updateSlot(slot.Id, { isRequired: false });
      }
      await updateSession(sessionRowId, {
        category: result.category,
        status: "collecting",
        observabilityFields: { action_intent: actionIntent, urgency, sentiment }
      });
      session       = { ...session, category: result.category };
      currentStatus = "collecting";
      if (actionIntent !== "learn") {
        await initRequiredSlots(sessionUid, result.category, ctx);
      }
    } else {
      await updateSession(sessionRowId, {
        observabilityFields: { action_intent: actionIntent, urgency, sentiment }
      });
    }
  }

  // learn: FAQへ即答するため症状スロット収集をスキップするフラグ
  // verify + KNOWLEDGE_FIRST_CATEGORIES: 「〜可能ですか」「〜できますか」系の機能確認質問も
  // スロット収集をスキップしてスキル優先にする（スロット質問ループを防ぐ）
  const isLearnIntent        = actionIntent === "learn" ||
    (actionIntent === "verify" && KNOWLEDGE_FIRST_CATEGORIES.has(session.category));
  const isTroubleshootIntent = actionIntent === "troubleshoot";

  // Agentic Slot Loop の結果 (troubleshoot intent 時に Step 9 で設定)
  // null の場合はレガシー（ルールベース）フローで継続する
  let agenticResult = null;

  logger.info("action intent resolved", {
    sessionUid,
    category: session.category,
    action_intent: actionIntent,
    urgency,
    sentiment,
    is_learn_intent: isLearnIntent,
    ...ctx
  });

  // ── 8. エスカレーション判定 (毎ターン実行) ──
  // executionProfile.policyProfile.escalationKeywords を使う (concierge ごとに設定可能)
  // urgency:high かつ sentiment:frustrated の組み合わせも追加エスカレーショントリガーとして扱う
  const escalationKeywords = executionProfile.policyProfile.escalationKeywords;
  const keywordEscalate = checkEscalation(event.latest_user_message, escalationKeywords);
  const intentEscalate  = urgency === "high" && sentiment === "frustrated";
  const shouldEscalate  = keywordEscalate || intentEscalate;
  const escalationReason = shouldEscalate
    ? (keywordEscalate
        ? resolveEscalationReason(event.latest_user_message, escalationKeywords)
        : `intent_signal: urgency=${urgency}, sentiment=${sentiment}`)
    : null;

  if (shouldEscalate) {
    logger.info("escalation flagged", {
      sessionUid,
      category: session.category,
      should_escalate: true,
      escalation_reason: escalationReason,
      ...ctx
    });
    logger.info("escalation reason resolved", {
      sessionUid,
      category: session.category,
      escalation_reason: escalationReason,
      ...ctx
    });
  }

  // ── 8b. コンシェルジュツール実行 ──────────────
  // 設定されたツールを実行し、LLM コンテキストに追加する情報を収集する。
  // エラーは非致命的（ログのみ）。
  const conciergeToolContext = {};
  {
    const conciergeTools = await getConciergeTools(executionProfile.conciergeKey ?? "").catch(() => []);
    if (conciergeTools.length > 0) {
      logger.info("concierge tools enabled", { sessionUid, tools: conciergeTools, ...ctx });
    }

    if (conciergeTools.includes("image-reading") && config.llm.apiKey) {
      try {
        const imageUrls = extractImageAttachments(payload);
        if (imageUrls.length > 0) {
          const desc = await describeImages(imageUrls);
          if (desc) {
            conciergeToolContext.imageDescriptions = desc;
            logger.info("image reading completed", { sessionUid, image_count: imageUrls.length, ...ctx });
          }
        }
      } catch (err) {
        logger.warn("image reading failed (non-fatal)", { sessionUid, error: err?.message, ...ctx });
      }
    }

    if (conciergeTools.includes("page-loading")) {
      try {
        const urlsInMessage = extractUrls(event.latest_user_message);
        if (urlsInMessage.length > 0) {
          const results = await Promise.all(urlsInMessage.slice(0, 3).map(loadPage));
          conciergeToolContext.urlContext = results;
          logger.info("page loading completed", { sessionUid, url_count: results.length, ...ctx });
        }
      } catch (err) {
        logger.warn("page loading failed (non-fatal)", { sessionUid, error: err?.message, ...ctx });
      }
    }

    if (conciergeTools.includes("image-referencing")) {
      conciergeToolContext.allowImageMarkdown = true;
    }
  }

  // ── 8c. グローバル NL ポリシー取得 ───────────────
  const globalPolicyInstruction = await getNlPolicyInstruction().catch(() => null);

  // ── 9. slot 抽出 ─────────────────────────────
  // learn intent: FAQ/HC への即答を優先するためスロット収集をスキップ
  // troubleshoot intent: Agentic Loop が抽出・ハンドオフ判定・動的スロット生成を一括処理
  // handed_off 後も slot の保存は継続する
  if (isLearnIntent) {
    logger.info("slot extraction skipped (learn intent)", { sessionUid, category: session.category, ...ctx });
  } else if (
    isTroubleshootIntent &&
    !shouldEscalate &&
    currentStatus !== "handed_off" &&
    config.llm.apiKey &&
    session.category
  ) {
    // Agentic Slot Loop を実行 (スロット抽出 + ハンドオフ判定 + 動的スロット生成の 1 shot)
    // Step 9b の listSlotsBySessionUid() で更新後の allSlots を再取得するため、
    // ここでは NocoDB 更新のみ行い handoff 判定は Step 9b に委ねる。
    logger.info("agentic slot loop started (troubleshoot intent)", {
      sessionUid,
      category: session.category,
      ...ctx
    });
    agenticResult = await runAgenticTroubleshootLoop({
      sessionUid,
      session,
      event,
      allSlots: await listSlotsBySessionUid(sessionUid), // 最新スロット状態を渡す
      conversationHistorySummary,
      nlInstruction:           await getIntentNLInstruction(session.category).catch(() => null),
      globalPolicyInstruction: globalPolicyInstruction, // Step 8c でロード済み
      sentiment,               // 分類フェーズで取得した感情 ("frustrated"|"neutral"|"positive")
      customerName:            event.author_name || null,
      ctx,
    });
    if (agenticResult) {
      logger.info("agentic slot loop completed", {
        sessionUid,
        category: session.category,
        is_handoff_ready: agenticResult.is_handoff_ready,
        next_action:      agenticResult.next_action,
        customer_phase:   agenticResult.customer_phase,
        dynamic_to_ask:   agenticResult.dynamic_slots_to_ask.length,
        ...ctx
      });
    } else {
      // LLM 失敗 → レガシー抽出にフォールバック
      logger.warn("agentic slot loop returned null, falling back to legacy slot extraction", {
        sessionUid, ...ctx
      });
      await runSlotExtraction(sessionUid, session.category, event.latest_user_message, ctx);
    }
  } else if (config.llm.apiKey && session.category) {
    await runSlotExtraction(sessionUid, session.category, event.latest_user_message, ctx);
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
  let intentNLInstruction = null;  // 自然言語指示 (Step 9b でロード、Step 10 でも使用)

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

    if (currentStatus === "collecting" && !isLearnIntent) {
      // NL 指示が設定されていれば LLM で評価、なければルールベース
      // learn intent: スロット収集もハンドオフ評価もスキップしてスキルへ直行
      // troubleshoot + agentic: agenticResult.is_handoff_ready を使い isReadyForHandoffNL をスキップ

      let ready = false;
      let handoffEvalSource = "rule_based";

      if (agenticResult) {
        // Agentic Loop の判定を信頼する (ルールベース評価は不要)
        ready = agenticResult.is_handoff_ready || agenticResult.next_action === "handoff_to_human";
        handoffEvalSource = "agentic_loop";
        intentNLInstruction = null; // agentic loop 内で既に考慮済み

        logger.info("handoff eval source", {
          sessionUid,
          category: session.category,
          source: handoffEvalSource,
          is_handoff_ready: agenticResult.is_handoff_ready,
          next_action: agenticResult.next_action,
          ...ctx
        });
      } else {
        // レガシーフロー: NL 指示またはルールベースで評価
        intentNLInstruction = await getIntentNLInstruction(session.category).catch(() => null);
        const handoffEval = await isReadyForHandoffNL(
          session.category, allSlots, intentNLInstruction, event.latest_user_message
        );
        ready = handoffEval.ready;
        handoffEvalSource = handoffEval.source;

        logger.info("handoff eval source", {
          sessionUid,
          category: session.category,
          source: handoffEvalSource,
          nl_instruction_set: !!intentNLInstruction,
          ...ctx
        });

        if (ready) {
          handoffReason = handoffEval.reason || resolveHandoffReason(session.category, allSlots);
        }
      }

      if (agenticResult && ready) {
        handoffReason = agenticResult.reasoning ?? "agentic_handoff_ready";
      }

      if (ready) {
        if (KNOWLEDGE_FIRST_CATEGORIES.has(session.category)) {
          // knowledge-first: skill を試してから handoff 判断する
          handoffDeferredForSkill = true;
          logger.info("handoff deferred for knowledge skill evaluation", {
            sessionUid,
            category: session.category,
            filled_slots: filledSlotNames,
            missing_slots: missingSlotNames,
            handoff_reason: handoffReason,
            handoff_eval_source: handoffEvalSource,
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
            handoff_eval_source: handoffEvalSource,
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
    (currentStatus === "collecting" || handoffDeferredForSkill || isLearnIntent) &&
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
        category: session.category,
        latestUserMessage: event.latest_user_message,
        collectedSlots,
        authorName: event.author_name || null,
        skillProfile: executionProfile.skillProfile,
        sourcePriorityProfile: executionProfile.sourcePriorityProfile,
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

  } else if (isLearnIntent) {
    // learn intent: スキルが回答した場合はそのまま使用。
    // 未回答の場合は次質問生成（スロット収集なし）にフォールバックする。
    if (skillResult?.handled) {
      replySourceCandidate = skillResult.answer_type;
      let skillCandidateDetail = {};
      try {
        if (skillResult.answer_candidate_json) {
          skillCandidateDetail = JSON.parse(skillResult.answer_candidate_json);
        }
      } catch { /* ignore */ }
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
    } else {
      // スキル未回答: スロットが0件なので next_message に落とすと「必要な情報がすべて揃いました。」に
      // なってしまう。代わりに ready_for_handoff へ遷移して担当者引き継ぎメッセージを返す。
      logger.info("learn-intent: all skills rejected, routing to handoff", { sessionUid, ...ctx });
      currentStatus = "ready_for_handoff";
      await updateSession(sessionRowId, { status: currentStatus, shouldEscalate });
      replySourceCandidate = "handoff";
      answerCandidateJson = JSON.stringify({
        answer_type: null,
        answer_message: null,
        sources: [],
        confidence: null,
        ask_slots: [],
        next_message: null,
        should_escalate: shouldEscalate,
        reason: "learn_intent_unanswered",
        reply_source_candidate: replySourceCandidate,
        ...obsBase
      });
    }

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
      // soft answer: 部分回答 (confidence 0.45〜0.64) + スロット質問を結合
      replySourceCandidate = "soft_answer";
      const askSlots = selectAskSlots(session.category, allSlots);
      const combinedMessage = buildSoftAnswerMessage(skillResult.soft_answer_message, askSlots);
      logger.info("soft answer combined", {
        sessionUid,
        category: session.category,
        soft_confidence: skillResult.soft_confidence,
        ask_slots: askSlots,
        ...ctx
      });
      answerCandidateJson = JSON.stringify({
        answer_type: "soft_answer",
        answer_message: combinedMessage,
        sources: [],
        confidence: skillResult.soft_confidence,
        reason: `soft_answer from ${skillResult.selected_skill}`,
        ask_slots: askSlots,
        next_message: null,
        should_escalate: shouldEscalate,
        reply_source_candidate: replySourceCandidate,
        ...obsBase
      });
    } else {
      // 次質問生成 (skill 不採用またはカテゴリに skill なし)
      //
      // troubleshoot + agentic: dynamic_slots_to_ask を question_text として使う
      // それ以外: runNextQuestionGeneration() で LLM 生成
      if (agenticResult && agenticResult.next_action === "ask_user") {
        replySourceCandidate = "next_message";
        const dynamicQ      = agenticResult.dynamic_slots_to_ask;
        // LLM 生成の完成文を優先。生成されていなければ question_text の結合にフォールバック
        const nextMessage   = agenticResult.final_output_text
          ?? (dynamicQ.length > 0 ? dynamicQ.map((d) => d.question_text).join("\n\n") : null);
        answerCandidateJson = JSON.stringify({
          answer_type: null,
          answer_message: null,
          sources: [],
          confidence: null,
          ask_slots: dynamicQ.map((d) => d.slot_name),
          next_message: nextMessage,
          should_escalate: shouldEscalate,
          reason: agenticResult.reasoning ?? "agentic_dynamic_question",
          reply_source_candidate: replySourceCandidate,
          ...obsBase
        });
        logger.info("agentic dynamic question selected", {
          sessionUid,
          category: session.category,
          ask_slots: dynamicQ.map((d) => d.slot_name),
          has_final_output_text: Boolean(agenticResult.final_output_text),
          ...ctx
        });
      } else {
        try {
          const isFirstContact = messageOrder === 1 && ["ab_test_experience", "heatmap_analytics", "popup_event", "bug_report"].includes(session.category);
          const { candidateData } = await runNextQuestionGeneration(
            sessionUid, session, event.latest_user_message, shouldEscalate, allSlots, ctx, event.author_name || null, isFirstContact, intentNLInstruction, conciergeToolContext, globalPolicyInstruction, conversationHistorySummary
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
    }

  } else if (currentStatus === "ready_for_handoff") {
    // handoff メタデータを answer_candidate_json に保存する
    // agentic loop が final_output_text を生成した場合: answer_type="agentic_message" として
    // reply-resolver の hasSkillAnswer (priority 2) に捕捉させ、固定 buildHandoffReply より優先する
    const agenticHandoffText = agenticResult?.final_output_text ?? null;
    replySourceCandidate = agenticHandoffText ? "agentic_message" : "handoff";
    answerCandidateJson = JSON.stringify({
      answer_type:    agenticHandoffText ? "agentic_message" : null,
      answer_message: agenticHandoffText ?? null,
      sources: [],
      confidence: null,
      ask_slots: [],
      next_message: null,
      should_escalate: shouldEscalate,
      reply_source_candidate: replySourceCandidate,
      ...obsBase
    });
    if (agenticHandoffText) {
      logger.info("agentic handoff message selected", {
        sessionUid,
        category: session.category,
        has_final_output_text: true,
        ...ctx
      });
    }
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
    category: session.category,
    status: currentStatus,
    latest_user_message: event.latest_user_message?.slice(0, 200) ?? null,
    selected_skill: skillResult?.selected_skill ?? null,
    reply_source: replySource,
    should_escalate: shouldEscalate,
    filled_slots_count: filledSlotsCount,
    missing_slots_count: missingSlotNames.length,
    decision_trace: decisionTrace,
    recorded_at: new Date().toISOString(),
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

  // ── 12. reply 可否チェック (targeting は Step 5.5 で解決済み) ──────────
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
    reason:        targeting.reason,
    matched_type:  targeting.matchedType,
    matched_value: targeting.matchedValue,
    conversation_id: event.intercom_conversation_id,
    contact_id: event.intercom_contact_id ?? null,
    ...ctx
  });

  const replyMode = targeting.concierge?.reply_mode ?? "reply";
  const conciergeAdminId = targeting.concierge?.intercom_admin_id ?? null;

  // ── duplicate webhook guard (2 重チェック) ────────────────────────────
  // Step 4 の事前チェックはメッセージ未保存時の競合を防ぎきれないため、
  // ノート/返信投稿直前にも bot 返信レコードの存在を確認する。
  const existingBotMsg = await findMessageByIntercomMessageId(`bot-${event.intercom_message_id}`).catch(() => null);
  if (existingBotMsg) {
    logger.info("note/reply skipped: bot reply already recorded (duplicate webhook guard)", { ...ctx });
    return;
  }
  // bot 返信を先行保存してべき等性ガードとする。
  // NocoDB の unique 制約が有効なら 2 件目がここで弾かれる。
  try {
    const botMsgOrder = (await countMessagesBySessionUid(sessionUid)) + 1;
    await createMessage({
      sessionUid,
      messageId: `bot-${event.intercom_message_id}`,
      role: "bot",
      messageText: replyMessage,
      messageOrder: botMsgOrder,
      createdAtTs: new Date().toISOString(),
      rawPayloadJson: null
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      logger.info("note/reply skipped: bot message pre-save duplicate (duplicate webhook guard)", { ...ctx });
      return;
    }
    logger.warn("bot message pre-save failed (non-fatal, continuing)", { sessionUid, error: err?.message, ...ctx });
  }

  try {
    if (replyMode === "note") {
      // スキル情報・参照元をノートのフッターに添付する
      let noteSources = [];
      try {
        const cand = typeof answerCandidateJson === "string"
          ? JSON.parse(answerCandidateJson)
          : answerCandidateJson;
        noteSources = Array.isArray(cand?.sources) ? cand.sources : [];
      } catch {}
      const noteCandidates = Array.isArray(skillResult?.candidate_results)
        ? skillResult.candidate_results
        : [];

      // ナレッジから複数の回答候補を生成して担当者の選択肢を提示する
      let noteCandidateResult = null;
      const isClosing = isClosingMessage(event.latest_user_message || "");
      if (session.category && config.llm.apiKey && !isClosing) {
        const sessionContext = await buildNoteQueryContext(sessionUid, event.latest_user_message);
        try {
          noteCandidateResult = await generateAnswerCandidatesForNote({
            category: session.category,
            latestUserMessage: sessionContext,
            collectedSlots: Object.fromEntries(
              allSlots.filter(isFilledSlot).map(s => [s.slot_name, s.slot_value])
            ),
            authorName: event.author_name || null,
          });
          logger.info("note candidates generated", {
            count: noteCandidateResult?.candidates?.length ?? 0,
            branch_axis: noteCandidateResult?.branchAxis,
            ...ctx
          });
        } catch (err) {
          logger.warn("note candidates generation failed (non-fatal)", { error: err?.message, ...ctx });
        }
      }

      await addNoteToConversation(
        event.intercom_conversation_id,
        replyMessage,
        conciergeAdminId,
        { replySource, sources: noteSources, candidateResults: noteCandidates },
        noteCandidateResult
      );
      logger.info("note added (memo mode)", {
        reply_source: replySource,
        sources_count: noteSources.length,
        skill_candidates: noteCandidates.map((c) => c.skill_name),
        answer_candidates_count: noteCandidateResult?.candidates?.length ?? 0,
        admin_id: conciergeAdminId,
        ...ctx
      });
    } else {
      await replyToConversation(event.intercom_conversation_id, replyMessage, conciergeAdminId);
      logger.info("reply success", { reply_source: replySource, admin_id: conciergeAdminId, ...ctx });
    }

    // handoff reply 成功 → handed_off に遷移
    if (replySource === "handoff") {
      await updateSession(sessionRowId, { status: "handed_off" });
      logger.info("session status updated", { sessionUid, status: "handed_off", ...ctx });
    }
  } catch (err) {
    logger.warn("reply failed", {
      reply_source: replySource,
      error: err?.message || String(err),
      ...ctx
    });
  }
}
