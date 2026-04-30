// ─────────────────────────────────────────────
// Dynamic Skill Runner
//
// NocoDB の skills テーブルに登録された設定ベースのスキルを実行する。
//
// 対応 source_type:
//   - knowledge_chunks_search : knowledge_chunks テーブルを source_type/tags で絞り込んで LLM 回答
//   - keyword_match           : NocoDB テーブルのキーワードマッチ（known-bug-match と同じ仕組み）
// ─────────────────────────────────────────────

import { config } from "../config.js";
import { listRecords } from "../nocodb.js";
import { retrieveKnowledgeCandidates, filterExposable, buildQuery } from "../knowledge/retrieval.js";
import { logger } from "../logger.js";

function notHandled(reason) {
  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence: 0,
    sources: [],
    reason,
    should_escalate: false,
    next_action: null,
  };
}

function unwrapList(data) {
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data)) return data;
  return [];
}

// ── LLM 呼び出し（knowledge_chunks_search 用）──────────────────────────

async function callLlmWithCandidates({ skillKey, promptTemplate, userQuery, candidates, authorName }) {
  const customerLabel = authorName ? `${authorName}様` : "お客様";
  const sourceContext = candidates
    .map((c) => `## ${c.title}${c.url ? `\nURL: ${c.url}` : ""}\n\n${c.body || "(本文なし)"}`)
    .join("\n\n---\n\n");

  const systemPrompt = promptTemplate
    ? promptTemplate.replace("{{customer_label}}", customerLabel)
    : `あなたは ${customerLabel} をサポートするサポートエージェントです。
以下の参考記事を使い、顧客の質問に日本語で丁寧に回答してください。
参考記事から回答できない場合は confidence を 0.3 以下にしてください。
回答は必ず JSON で返してください: { "confidence": 0.0〜1.0, "answer_message": "回答文", "reason": "採用/不採用の理由" }`;

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userQuery + "\n\n参照記事:\n" + sourceContext },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── source_type: knowledge_chunks_search ───────────────────────────────

async function runKnowledgeChunksSearch(skillDef, sourceConfig, { latestUserMessage, category, collectedSlots, authorName }) {
  const allowedSourceTypes = sourceConfig.source_type_filter
    ? [sourceConfig.source_type_filter]
    : undefined;
  const limit = sourceConfig.limit ?? 5;

  const retrievalQuery = buildQuery(category, latestUserMessage, collectedSlots || {});

  let candidates = [];
  try {
    const all = await retrieveKnowledgeCandidates({
      category,
      latestUserMessage,
      collectedSlots: collectedSlots || {},
      allowedSourceTypes,
      limit,
    });
    candidates = filterExposable(all);
  } catch (err) {
    return notHandled(`retrieval failed: ${err?.message}`);
  }

  if (candidates.length === 0) {
    return notHandled(`no candidates | query:${retrievalQuery}`);
  }

  const candidateSummary = {
    retrieval_query: retrievalQuery,
    candidate_count: candidates.length,
    candidate_titles: candidates.map((c) => c.title),
    candidate_chunk_ids: candidates.map((c) => c.chunk_id).filter(Boolean),
  };

  let llmResult;
  try {
    llmResult = await callLlmWithCandidates({
      skillKey: skillDef.skill_key,
      promptTemplate: skillDef.prompt_template || null,
      userQuery: latestUserMessage,
      candidates,
      authorName: authorName || null,
    });
  } catch (err) {
    return {
      ...notHandled(`LLM failed: ${err?.message}`),
      answer_candidate_json: JSON.stringify(candidateSummary),
    };
  }

  const confidence = typeof llmResult?.confidence === "number" ? llmResult.confidence : 0;
  const answer_message = llmResult?.answer_message || null;

  if (answer_message) {
    return {
      handled: true,
      answer_type: skillDef.skill_key,
      answer_message,
      confidence,
      sources: candidates
        .map((c) => ({ chunk_id: c.chunk_id, title: c.title, url: c.url }))
        .filter((s) => s.url || s.chunk_id),
      reason: llmResult.reason || null,
      answer_candidate_json: JSON.stringify(candidateSummary),
      should_escalate: false,
      next_action: "reply",
    };
  }

  return {
    handled: false,
    answer_type: null,
    answer_message: null,
    confidence,
    sources: [],
    reason: llmResult?.reason || "LLM returned no answer_message",
    answer_candidate_json: JSON.stringify(candidateSummary),
    should_escalate: false,
    next_action: null,
  };
}

// ── source_type: keyword_match ─────────────────────────────────────────

function computeKeywordScore(record, keywordField, searchText) {
  const raw = String(record[keywordField] || "");
  if (!raw.trim()) return 0;
  const keywords = raw.split(/[,、\s]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (keywords.length === 0) return 0;
  const text = searchText.toLowerCase();
  const matched = keywords.filter((k) => text.includes(k));
  return matched.length / keywords.length;
}

async function runKeywordMatch(skillDef, sourceConfig, { latestUserMessage, collectedSlots }) {
  const tableId = sourceConfig.table_id;
  const keywordField = sourceConfig.keyword_field || "matching_keywords";
  const responseField = sourceConfig.response_field || "customer_safe_message";
  const titleField = sourceConfig.title_field || "title";

  if (!tableId) {
    return notHandled("keyword_match: table_id not configured in source_config");
  }

  const searchText = [
    latestUserMessage || "",
    collectedSlots?.symptom || "",
    collectedSlots?.reproduction_steps || "",
  ].join(" ").trim();

  let records = [];
  try {
    const data = await listRecords(tableId, {
      where: "(published_to_bot,eq,true)",
      limit: 200,
    });
    records = unwrapList(data).filter((r) => {
      const status = String(r.status || "").toLowerCase();
      return status !== "archived";
    });
  } catch (err) {
    return notHandled(`keyword_match: load failed: ${err?.message}`);
  }

  if (records.length === 0) {
    return notHandled("keyword_match: no published records");
  }

  let bestRecord = null;
  let bestScore = 0;
  for (const record of records) {
    const score = computeKeywordScore(record, keywordField, searchText);
    if (score > bestScore) {
      bestScore = score;
      bestRecord = record;
    }
  }

  if (!bestRecord || bestScore === 0) {
    return notHandled("keyword_match: no keyword match");
  }

  const message = bestRecord[responseField];
  if (!message) {
    return notHandled(`keyword_match: no ${responseField} in matched record`);
  }

  return {
    handled: true,
    answer_type: skillDef.skill_key,
    answer_message: String(message),
    confidence: Math.min(bestScore, 1.0),
    sources: [{ title: bestRecord[titleField] || skillDef.skill_key, url: null }],
    reason: `keyword_match score=${bestScore.toFixed(2)}`,
    should_escalate: false,
    next_action: "reply",
  };
}

// ── エントリーポイント ───────────────────────────────────────────────────

export async function runDynamicSkill(skillDef, { latestUserMessage, category, collectedSlots, authorName, sourcePriorityProfile }) {
  const sourceConfig = (() => {
    try {
      return skillDef.source_config ? JSON.parse(skillDef.source_config) : {};
    } catch {
      return {};
    }
  })();

  logger.info("dynamic skill started", { skill_key: skillDef.skill_key, source_type: skillDef.source_type, category });

  switch (skillDef.source_type) {
    case "knowledge_chunks_search":
      return runKnowledgeChunksSearch(skillDef, sourceConfig, { latestUserMessage, category, collectedSlots, authorName });

    case "keyword_match":
      return runKeywordMatch(skillDef, sourceConfig, { latestUserMessage, collectedSlots });

    default:
      return notHandled(`unknown source_type: ${skillDef.source_type}`);
  }
}
