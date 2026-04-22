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
import { retrieveKnowledgeCandidates, filterExposable, buildQuery } from "../knowledge/retrieval.js";

export const SKILL_NAME = "faq_answer";
export const CONFIDENCE_THRESHOLD = 0.65;

const SUPPORTED_CATEGORIES = new Set(["usage_guidance", "experience_issue"]);

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
 * Notion FAQ source を使って回答候補を生成する。
 * knowledge_chunks が空の場合は handled=false を返す。
 *
 * @param {{ latestUserMessage: string, category: string, collectedSlots: object }} opts
 * @returns {Promise<SkillResult>}
 */
export async function runFaqAnswerSkill({ latestUserMessage, category, collectedSlots }) {
  if (!SUPPORTED_CATEGORIES.has(category)) {
    return notHandled(`category ${category} is not supported by faq_answer`);
  }

  if (!config.llm.apiKey) {
    return notHandled("LLM_API_KEY not set");
  }

  // notion_faq source のみ検索 (notion_cse は使わない)
  // experience_issue は同一症状に複数原因パターンがあるため5件取得して統合回答を生成
  const retrievalQuery = buildQuery(category, latestUserMessage, collectedSlots || {});
  let candidates = [];
  try {
    const all = await retrieveKnowledgeCandidates({
      category,
      latestUserMessage,
      collectedSlots: collectedSlots || {},
      allowedSourceTypes: ["notion_faq"],
      limit: 5
    });
    candidates = filterExposable(all);
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
    llmResult = await generateAnswerFromCandidates(latestUserMessage, collectedSlots || {}, candidates);
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

async function generateAnswerFromCandidates(latestUserMessage, collectedSlots, candidates) {
  const sourceContext = candidates
    .map((c) => `## ${c.title}${c.url ? `\nURL: ${c.url}` : ""}\n\n${c.body || "(本文なし)"}`)
    .join("\n\n---\n\n");

  const slotContext = [];
  if (collectedSlots?.target_feature) slotContext.push(`機能: ${collectedSlots.target_feature}`);
  if (collectedSlots?.user_goal) slotContext.push(`目的: ${collectedSlots.user_goal}`);
  if (collectedSlots?.experience_name) slotContext.push(`体験名: ${collectedSlots.experience_name}`);
  if (collectedSlots?.symptom) slotContext.push(`症状: ${collectedSlots.symptom}`);

  const userQuery = [latestUserMessage, ...slotContext].filter(Boolean).join(" / ");

  const systemPrompt = `あなたはPtengineのサポートBotです。社内FAQを参照して顧客の質問に回答してください。

FAQの性格:
- FAQはトラブルシューティング型です（「なぜこうなるか」「どう解決するか」を説明）
- 同じ症状に複数の原因パターンがある場合、代表的なものをまとめて説明してください

回答ルール:
- 提供されたFAQ情報のみを根拠にする
- 社内向けの情報・担当者名・内部URLは含めない
- 断定しすぎない（「〜の可能性があります」「〜から確認ください」程度）
- 複数のFAQが関連する場合は統合して「主な原因として〜が考えられます」形式で回答
- 回答は400文字以内
- 確信度の基準:
  - FAQ が症状・機能名と一致 → 0.75以上
  - FAQ が部分的に関連 → 0.5〜0.74
  - FAQ が無関係・全く別の話題 → 0.3以下

出力はJSONのみ:
{
  "answer_message": "回答文（FAQが完全に無関係な場合のみnull）",
  "confidence": 0.75,
  "reason": "参照したFAQタイトルと関連性の説明"
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
