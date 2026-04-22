// ─────────────────────────────────────────────
// skill: help_center_answer
//
// usage_guidance / experience_issue intent で使用。
// Ptengine Help Center を参照してユーザーの使い方・体験系質問に回答する。
//
// 返却 shape は共通 skill interface に準拠:
//   { handled, answer_type, answer_message, confidence, sources, reason, should_escalate, next_action }
//
// 信頼度閾値のチェックは orchestrator 側で行う。
// このスキルは「検索して LLM に回答を生成させた結果」をそのまま返す。
// ─────────────────────────────────────────────

import { config } from "../config.js";

export const SKILL_NAME = "help_center_answer";
export const CONFIDENCE_THRESHOLD = 0.65;

const HELP_CENTER_BASE = "https://helps.ptengine.com";
const MAX_SOURCES = 2;
const FETCH_TIMEOUT_MS = 8000;
const MAX_ARTICLE_CHARS = 2000;

// 共通 interface の空結果を生成するヘルパー
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

function buildQuery(category, latestUserMessage, collectedSlots) {
  const parts = [];
  if (category === "experience_issue") {
    if (collectedSlots?.experience_name) parts.push(collectedSlots.experience_name);
    if (collectedSlots?.symptom) parts.push(collectedSlots.symptom);
    if (collectedSlots?.device_type) parts.push(collectedSlots.device_type);
  } else {
    // usage_guidance
    if (collectedSlots?.target_feature) parts.push(collectedSlots.target_feature);
    if (collectedSlots?.user_goal) parts.push(collectedSlots.user_goal);
    if (collectedSlots?.feature_category) parts.push(collectedSlots.feature_category);
  }
  // 元の発話を常に補完する (slot が英語コードでも日本語マッチを保証)
  const msgSlice = latestUserMessage.slice(0, 150);
  if (!parts.includes(msgSlice)) parts.push(msgSlice);
  return parts.join(" ");
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

async function fetchArticleText(url) {
  return fetchArticleBodyFromUrl(url);
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

async function generateAnswerFromSources(latestUserMessage, collectedSlots, sources) {
  const contents = await Promise.all(
    sources.map(async (s) => {
      const content = await fetchArticleText(s.url);
      return { ...s, content };
    })
  );

  const sourceContext = contents
    .map((s) => `## ${s.title}\nURL: ${s.url}\n\n${s.content || "(本文取得失敗)"}`)
    .join("\n\n---\n\n");

  const slotContext = [];
  if (collectedSlots?.target_feature) slotContext.push(`機能: ${collectedSlots.target_feature}`);
  if (collectedSlots?.user_goal) slotContext.push(`目的: ${collectedSlots.user_goal}`);
  if (collectedSlots?.experience_name) slotContext.push(`体験名: ${collectedSlots.experience_name}`);
  if (collectedSlots?.symptom) slotContext.push(`症状: ${collectedSlots.symptom}`);

  const userQuery = [latestUserMessage, ...slotContext].filter(Boolean).join(" / ");

  const systemPrompt = `あなたはPtengineのサポートBotです。Help Center記事を参照して顧客の使い方質問に簡潔に回答してください。

ルール:
- 公開Help Center記事の情報のみを根拠にする
- 断定しすぎない（「〜から確認できます」「〜の手順が参考になります」程度）
- 回答は300文字以内
- 記事URLを最大2件まで案内してよい
- 回答できる確信度を0.0〜1.0でつける (記事が的確なら0.8以上、部分的なら0.5〜0.7、無関係なら0.3以下)

出力はJSONのみ:
{
  "answer_message": "回答文（記事が無関係な場合はnull）",
  "confidence": 0.75,
  "reason": "根拠の説明"
}`;

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

const SUPPORTED_CATEGORIES = new Set(["usage_guidance", "experience_issue"]);

/**
 * usage_guidance / experience_issue 向け Help Center 回答 skill。
 *
 * 共通 skill interface を返す。信頼度閾値チェックは orchestrator が行う。
 *
 * @param {{ latestUserMessage: string, category: string, collectedSlots: object }} opts
 * @returns {Promise<SkillResult>}
 */
export async function runHelpCenterAnswerSkill({ latestUserMessage, category, collectedSlots }) {
  if (!SUPPORTED_CATEGORIES.has(category)) {
    return notHandled(`category ${category} is not supported by help_center_answer`);
  }

  if (!config.llm.apiKey) {
    return notHandled("LLM_API_KEY not set");
  }

  const query = buildQuery(category, latestUserMessage, collectedSlots || {});

  let candidates = [];
  try {
    candidates = await searchHelpCenter(query);
  } catch (err) {
    return notHandled(`search failed: ${err?.message}`);
  }

  if (candidates.length === 0) {
    return notHandled(`no candidates found | query:${query}`);
  }

  // 候補の観測情報 (faq_answer と同形式)
  const hcCandidateJson = JSON.stringify({
    retrieval_query: query,
    candidate_count: candidates.length,
    candidate_titles: candidates.map((c) => c.title)
  });

  let llmResult;
  try {
    llmResult = await generateAnswerFromSources(latestUserMessage, collectedSlots || {}, candidates);
  } catch (err) {
    return {
      handled: false,
      answer_type: null,
      answer_message: null,
      confidence: 0,
      sources: candidates,
      reason: `LLM failed: ${err?.message}`,
      answer_candidate_json: hcCandidateJson,
      should_escalate: false,
      next_action: null
    };
  }

  const confidence = typeof llmResult?.confidence === "number" ? llmResult.confidence : 0;
  const answer_message = llmResult?.answer_message || null;

  // 候補が見つかり LLM が回答を生成した場合は handled=true。
  // 閾値チェックは orchestrator で行うため、confidence が低くても handled=true を返す。
  if (answer_message) {
    return {
      handled: true,
      answer_type: SKILL_NAME,
      answer_message,
      confidence,
      sources: candidates,
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
    sources: candidates,
    reason: llmResult?.reason || "LLM returned no answer_message",
    answer_candidate_json: hcCandidateJson,
    should_escalate: false,
    next_action: null
  };
}
