// ─────────────────────────────────────────────
// skill: faq_answer
//
// usage_guidance / experience_issue 向け。
// knowledge_chunks テーブルの notion_faq source を使って FAQ 回答候補を返す。
//
// FAQ の性格 (2026-04 分析):
//   - 全87件がトラブルシューティング型 (how-to FAQはゼロ)
//   - experience_issue に最強: 37件が表示されない/反映されない/データ異常をカバー
//   - usage_guidance には弱い (how-to FAQ が存在しない)
//
// policy:
//   - notion_faq: published_to_bot=true のものだけ顧客返答可
//   - notion_cse: このスキルでは使わない (内部補助のみ)
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { loadSkillPrompt } from "../policy-loader.js";
import { retrieveKnowledgeCandidates, filterExposable, buildQuery } from "../knowledge/retrieval.js";

export const SKILL_NAME = "faq_answer";
export const CONFIDENCE_THRESHOLD = 0.65;

const SUPPORTED_CATEGORIES = new Set([
  "usage_guidance",
  "experience_issue",
  "login_account",
  "billing_contract",
  "general_inquiry"
]);

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

/**
 * ユーザーメッセージから複数の質問セグメントを抽出する。
 * 「？」区切りまたは接続詞区切りで2件以上の質問を検出した場合に分割する。
 *
 * @param {string} message
 * @returns {string[]} 質問セグメントの配列 (分割不要なら [message] のまま)
 */
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

/**
 * Notion FAQ source を使って回答候補を生成する。
 * knowledge_chunks が空の場合は handled=false を返す。
 *
 * @param {{ latestUserMessage: string, category: string, collectedSlots: object, sourcePriorityProfile?: object }} opts
 * @returns {Promise<SkillResult>}
 */
export async function runFaqAnswerSkill({ latestUserMessage, category, collectedSlots, authorName, sourcePriorityProfile }) {
  if (!SUPPORTED_CATEGORIES.has(category)) {
    return notHandled(`category ${category} is not supported by faq_answer`);
  }

  // sourcePriorityProfile が指定されており notion_faq が許可されていない場合はスキップ
  if (sourcePriorityProfile?.allowedSources && !sourcePriorityProfile.allowedSources.includes("notion_faq")) {
    return notHandled("notion_faq source not allowed by source_priority_profile");
  }

  if (!config.llm.apiKey) {
    return notHandled("LLM_API_KEY not set");
  }

  // 複数質問を検出して並行検索する
  // 単一質問: limit=5, 複数質問: 各質問で limit=3 → 最大6件にマージ
  const retrievalQuery = buildQuery(category, latestUserMessage, collectedSlots || {});
  const questionSegments = extractQuestionSegments(latestUserMessage);
  const isMultiQuestion = questionSegments.length > 1;

  let candidates = [];
  try {
    if (isMultiQuestion) {
      const perQueryResults = await Promise.all(
        questionSegments.map(q =>
          retrieveKnowledgeCandidates({
            category,
            latestUserMessage: q,
            collectedSlots: collectedSlots || {},
            allowedSourceTypes: ["notion_faq"],
            limit: 3
          }).catch(() => [])
        )
      );
      const seen = new Set();
      const merged = perQueryResults
        .flat()
        .sort((a, b) => b.confidence_hint - a.confidence_hint)
        .filter(c => {
          const key = c.chunk_id ?? `${c.source_type}:${c.title}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 6);
      candidates = filterExposable(merged);
    } else {
      const all = await retrieveKnowledgeCandidates({
        category,
        latestUserMessage,
        collectedSlots: collectedSlots || {},
        allowedSourceTypes: ["notion_faq"],
        limit: 5
      });
      candidates = filterExposable(all);
    }
  } catch {
    return notHandled(`retrieval failed | query:${retrievalQuery}`);
  }

  if (candidates.length === 0) {
    return notHandled(`no faq candidates found | query:${retrievalQuery}`);
  }

  // candidate の観測情報を作成 (rejected でも候補が分かるようにする)
  const candidateSummary = {
    retrieval_query: retrievalQuery,
    candidate_count: candidates.length,
    candidate_chunk_ids: candidates.map((c) => c.chunk_id),
    candidate_titles: candidates.map((c) => c.title)
  };
  const candidateJson = JSON.stringify(candidateSummary);

  // LLM で回答を生成する
  let llmResult;
  try {
    llmResult = await generateAnswerFromCandidates(latestUserMessage, collectedSlots || {}, candidates, authorName || null, isMultiQuestion);
  } catch (err) {
    return {
      handled: false,
      answer_type: null,
      answer_message: null,
      confidence: 0,
      sources: candidates.map((c) => ({ chunk_id: c.chunk_id, title: c.title, url: c.url })),
      reason: `LLM failed: ${err?.message}`,
      answer_candidate_json: candidateJson,
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
      sources: candidates
        .map((c) => ({ chunk_id: c.chunk_id, title: c.title, url: c.url }))
        .filter((s) => s.url || s.chunk_id),
      reason: llmResult.reason || null,
      answer_candidate_json: candidateJson,
      should_escalate: false,
      next_action: "reply"
    };
  }

  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence,
    sources: [],
    reason: llmResult?.reason || "LLM returned no answer_message",
    answer_candidate_json: candidateJson,
    should_escalate: false,
    next_action: null
  };
}

async function generateAnswerFromCandidates(latestUserMessage, collectedSlots, candidates, authorName, isMultiQuestion = false) {
  const sourceContext = candidates
    .map((c) => `## ${c.title}${c.url ? `\nURL: ${c.url}` : ""}\n\n${c.body || "(本文なし)"}`)
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
    : "複数のFAQが関連する場合は統合して箇条書きで回答する";

  const systemPrompt = loadSkillPrompt("faq-answer", {
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
        { role: "user", content: userQuery + "\n\n参照FAQ:\n" + sourceContext }
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
