// ─────────────────────────────────────────────
// skill: help_center_answer
//
// usage_guidance / experience_issue intent で使用。
// Ptengine Help Center を参照してユーザーの使い方・体験系質問に回答する。
//
// 検索戦略 (2段構え):
//   1. knowledge_chunks テーブル (source_type=help_center) — sync-help-center cron で事前インデックス済み
//   2. オンデマンドスクレイピング (https://helps.ptengine.com) — チャンクが空の場合のフォールバック
//
// 返却 shape は共通 skill interface に準拠:
//   { handled, answer_type, answer_message, confidence, sources, reason, should_escalate, next_action }
//
// 信頼度閾値のチェックは orchestrator 側で行う。
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { loadSkillPrompt } from "../policy-loader.js";
import { searchChunks } from "../knowledge/chunks.js";

export const SKILL_NAME = "help_center_answer";
export const CONFIDENCE_THRESHOLD = 0.65;

const HELP_CENTER_BASE = "https://helps.ptengine.com";
const MAX_SOURCES = 2;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ARTICLE_CHARS = 2000;

function notHandled(reason) {
  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence: 0,
    sources: [],
    reason,
    should_escalate: false,
    next_action: null
  };
}

function extractQuestionSegments(message) {
  const byQuestion = message.split("？").map(s => s.trim()).filter(s => s.length > 8);
  if (byQuestion.length >= 2) return byQuestion;

  const byPeriod = message
    .split(/。\s*(?:また、|もう一点、|あと、|さらに、|ついでに、|加えて、)/)
    .map(s => s.trim())
    .filter(s => s.length > 8);
  if (byPeriod.length >= 2) return byPeriod;

  return [message];
}

function buildQuery(category, latestUserMessage, collectedSlots) {
  const parts = [];
  if (category === "experience_issue") {
    if (collectedSlots?.experience_name) parts.push(collectedSlots.experience_name);
    if (collectedSlots?.symptom) parts.push(collectedSlots.symptom);
    if (collectedSlots?.device_type) parts.push(collectedSlots.device_type);
  } else {
    if (collectedSlots?.target_feature) parts.push(collectedSlots.target_feature);
    if (collectedSlots?.user_goal) parts.push(collectedSlots.user_goal);
    if (collectedSlots?.feature_category) parts.push(collectedSlots.feature_category);
  }
  const msgSlice = latestUserMessage.slice(0, 150);
  if (!parts.includes(msgSlice)) parts.push(msgSlice);
  return parts.join(" ");
}

// ─── チャンクテーブル検索 ────────────────────────────────────────────────

/**
 * knowledge_chunks テーブルから help_center 記事を検索する。
 * @param {string} query
 * @returns {Promise<Array<{ title: string, url: string, body: string }>>}
 */
async function searchFromChunks(query) {
  try {
    const chunks = await searchChunks({
      sourceTypes: ["help_center"],
      query,
      limit: MAX_SOURCES
    });
    return chunks
      .filter((c) => c.title || c.body)
      .map((c) => ({ title: c.title, url: c.url, body: c.body }));
  } catch {
    return [];
  }
}

// ─── オンデマンドスクレイピング (フォールバック) ──────────────────────────

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Ptengine-SupportBot/1.0" }
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseArticlesFromHtml(html) {
  const results = [];
  const re = /href="(\/(?:en|ja|zh|ko)\/articles\/[^"#?]+)"[^>]*>\s*([^<]{3,120})\s*</g;
  let m;
  while ((m = re.exec(html)) !== null && results.length < MAX_SOURCES) {
    const url = `${HELP_CENTER_BASE}${m[1]}`;
    const title = m[2].trim();
    if (title) results.push({ title, url });
  }
  return results;
}

/**
 * Help Center 記事 URL から本文テキストを取得する。
 * retrieval.js からも共有利用される。
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchArticleBodyFromUrl(url) {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_ARTICLE_CHARS);
  } catch {
    return "";
  }
}

/**
 * Help Center を検索して候補記事を返す (最大 MAX_SOURCES 件)。
 * オンデマンドスクレイピング。フォールバック用。
 * @param {string} query
 * @returns {Promise<Array<{ title: string, url: string }>>}
 */
export async function searchHelpCenter(query) {
  const encoded = encodeURIComponent(query);

  try {
    const apiUrl = `${HELP_CENTER_BASE}/api/search?q=${encoded}`;
    const res = await fetchWithTimeout(apiUrl, FETCH_TIMEOUT_MS);
    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.includes("json")) {
      const data = await res.json();
      const articles = data?.results || data?.articles || [];
      if (articles.length > 0) {
        return articles.slice(0, MAX_SOURCES).map((a) => ({
          title: a.title || a.name || "",
          url: a.url || a.full_url || `${HELP_CENTER_BASE}/articles/${a.id}`
        })).filter((a) => a.title && a.url);
      }
    }
  } catch {}

  try {
    const searchUrl = `${HELP_CENTER_BASE}/?q=${encoded}`;
    const res = await fetchWithTimeout(searchUrl, FETCH_TIMEOUT_MS);
    if (res.ok) {
      const html = await res.text();
      return parseArticlesFromHtml(html);
    }
  } catch {}

  return [];
}

/**
 * オンデマンドで検索して記事本文を取得する。
 * @param {string} query
 * @returns {Promise<Array<{ title: string, url: string, body: string }>>}
 */
async function searchFromWeb(query) {
  const candidates = await searchHelpCenter(query);
  if (candidates.length === 0) return [];

  return Promise.all(
    candidates.map(async (c) => {
      const body = await fetchArticleBodyFromUrl(c.url);
      return { title: c.title, url: c.url, body };
    })
  );
}

// ─── LLM 回答生成 ───────────────────────────────────────────────────────

async function generateAnswerFromSources(latestUserMessage, collectedSlots, sources, authorName, isMultiQuestion = false) {
  const sourceContext = sources
    .map((s) => `## ${s.title}${s.url ? `\nURL: ${s.url}` : ""}\n\n${s.body || "(本文取得失敗)"}`)
    .join("\n\n---\n\n");

  const slotContext = [];
  if (collectedSlots?.target_feature) slotContext.push(`機能: ${collectedSlots.target_feature}`);
  if (collectedSlots?.user_goal) slotContext.push(`目的: ${collectedSlots.user_goal}`);
  if (collectedSlots?.experience_name) slotContext.push(`体験名: ${collectedSlots.experience_name}`);
  if (collectedSlots?.symptom) slotContext.push(`症状: ${collectedSlots.symptom}`);

  const userQuery = [latestUserMessage, ...slotContext].filter(Boolean).join(" / ");

  const customerLabel = authorName ? `${authorName}様` : "お客様";

  const multiQuestionInstruction = isMultiQuestion
    ? "顧客は複数の質問をしています。それぞれの質問に番号付きで回答してください（① ② ③ …）"
    : "複数の記事が関連する場合は統合して箇条書きで回答する";

  const systemPrompt = await loadSkillPrompt("help-center-answer", {
    customer_label: customerLabel,
    multi_question_instruction: multiQuestionInstruction
  });

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery + "\n\n参照Help Center記事:\n" + sourceContext }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`LLM error: ${JSON.stringify(data)}`);
  const content = data?.choices?.[0]?.message?.content;
  const trimmed = String(content || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`LLM returned non-JSON: ${trimmed.slice(0, 200)}`);
  }
}

// ─── メイン skill エントリ ───────────────────────────────────────────────

const SUPPORTED_CATEGORIES = new Set([
  "usage_guidance",
  "experience_issue",
  "login_account",
  "billing_contract",
  "general_inquiry"
]);

/**
 * usage_guidance / experience_issue 向け Help Center 回答 skill。
 *
 * 共通 skill interface を返す。信頼度閾値チェックは orchestrator が行う。
 *
 * @param {{ latestUserMessage: string, category: string, collectedSlots: object, sourcePriorityProfile?: object }} opts
 * @returns {Promise<object>}
 */
export async function runHelpCenterAnswerSkill({ latestUserMessage, category, collectedSlots, authorName, sourcePriorityProfile }) {
  if (!SUPPORTED_CATEGORIES.has(category)) {
    return notHandled(`category ${category} is not supported by help_center_answer`);
  }

  if (sourcePriorityProfile?.allowedSources && !sourcePriorityProfile.allowedSources.includes("help_center")) {
    return notHandled("help_center source not allowed by source_priority_profile");
  }

  if (!config.llm.apiKey) {
    return notHandled("LLM_API_KEY not set");
  }

  const query = buildQuery(category, latestUserMessage, collectedSlots || {});
  const questionSegments = extractQuestionSegments(latestUserMessage);
  const isMultiQuestion = questionSegments.length > 1;

  // ── 1. knowledge_chunks テーブルを優先検索 ──────────────────────────────
  let sources = [];
  let retrievalMethod = "chunks";

  if (isMultiQuestion) {
    const perSegmentResults = await Promise.all(
      questionSegments.map(q => searchFromChunks(buildQuery(category, q, collectedSlots || {})).catch(() => []))
    );
    const seen = new Set();
    sources = perSegmentResults
      .flat()
      .filter(s => {
        const key = s.url || s.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 4);
  } else {
    sources = await searchFromChunks(query);
  }

  // ── 2. チャンクが空ならオンデマンドスクレイピングにフォールバック ──────
  if (sources.length === 0) {
    try {
      sources = await searchFromWeb(query);
      retrievalMethod = "scraping";
    } catch (err) {
      return notHandled(`search failed: ${err?.message}`);
    }
  }

  if (sources.length === 0) {
    return notHandled(`no candidates found | method:${retrievalMethod} query:${query}`);
  }

  const hcCandidateJson = JSON.stringify({
    retrieval_method: retrievalMethod,
    retrieval_query: query,
    candidate_count: sources.length,
    candidate_titles: sources.map((s) => s.title)
  });

  let llmResult;
  try {
    llmResult = await generateAnswerFromSources(latestUserMessage, collectedSlots || {}, sources, authorName || null, isMultiQuestion);
  } catch (err) {
    return {
      handled: false,
      answer_type: null,
      answer_message: null,
      confidence: 0,
      sources: sources.map((s) => ({ title: s.title, url: s.url })),
      reason: `LLM failed: ${err?.message}`,
      answer_candidate_json: hcCandidateJson,
      should_escalate: false,
      next_action: null
    };
  }

  const confidence = typeof llmResult?.confidence === "number" ? llmResult.confidence : 0;
  const answer_message = llmResult?.answer_message || null;

  if (answer_message) {
    return {
      handled: true,
      answer_type: SKILL_NAME,
      answer_message,
      confidence,
      sources: sources.map((s) => ({ title: s.title, url: s.url })),
      reason: llmResult.reason || null,
      answer_candidate_json: hcCandidateJson,
      should_escalate: false,
      next_action: "reply"
    };
  }

  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence,
    sources: sources.map((s) => ({ title: s.title, url: s.url })),
    reason: llmResult?.reason || "LLM returned no answer_message",
    answer_candidate_json: hcCandidateJson,
    should_escalate: false,
    next_action: null
  };
}
