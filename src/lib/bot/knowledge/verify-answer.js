/**
 * verify-answer.js
 *
 * Sub-agent pipeline for FAQ answer verification.
 *
 * Stage 2: verifyAndPlan
 *   - 取得済み候補チャンクとユーザー質問を照合し、複数の解釈を列挙する
 *   - ANSWER / CLARIFY / ESCALATE の方針を決定する
 *
 * Stage 3: validateClarification (action=CLARIFY のときのみ実行)
 *   - 提案された追加質問が本当に必要か・適切かを独立した LLM で検証する
 *   - 不要・不適切と判断した場合は ANSWER にフォールバックする
 */

import { config } from "../config.js";
import { logger } from "../logger.js";

// ----- LLM 呼び出し共通 ------------------------------------------------

async function llmJson(systemPrompt, userContent) {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM error (${res.status})`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`non-JSON from LLM: ${raw.slice(0, 200)}`);
  }
}

// ----- Stage 2: verifyAndPlan ------------------------------------------

/**
 * 候補チャンクが質問に答えているかを評価し、方針を返す。
 *
 * @returns {{
 *   interpretations: {label:string, confidence:number, chunk_index:number|null}[],
 *   action: "ANSWER"|"CLARIFY"|"ESCALATE",
 *   best_chunk_index: number|null,
 *   clarifying_question: string|null,
 *   reason: string
 * }}
 */
async function verifyAndPlan({ question, candidates }) {
  const chunksText = candidates
    .slice(0, 5)
    .map((c, i) =>
      `[${i + 1}] タイトル: ${c.title}\n本文: ${c.body?.slice(0, 500) ?? "(なし)"}${c.url ? `\nURL: ${c.url}` : ""}`
    )
    .join("\n\n");

  const system = `あなたはカスタマーサポートAIの品質管理エージェントです。
ユーザー質問と取得された知識候補を照合し、以下のJSONのみ出力してください:
{
  "interpretations": [
    {"label": "質問の解釈（短く）", "confidence": 0.0〜1.0, "chunk_index": 1〜5またはnull}
  ],
  "action": "ANSWER" または "CLARIFY" または "ESCALATE",
  "best_chunk_index": 1〜5またはnull,
  "clarifying_question": null または "顧客に追加で聞くべき1文（丁寧語）",
  "reason": "判断の根拠"
}

判断基準:
- ANSWER  : 最も信頼度が高い解釈のchunkが質問に直接答えている（confidence≥0.7）
- CLARIFY : 解釈が複数あり判断が難しい、または情報が不十分（confidence 0.4〜0.7）
- ESCALATE: どのchunkも質問に答えていない（confidence<0.4）またはchunkがない

重要: chunk の内容と質問が実質的に一致しているかを厳密に判断してください。
タイトルに同じ単語があっても、内容が違うトピックならマッチしていません。`;

  const user = `ユーザーの質問: ${question}\n\n候補チャンク:\n${chunksText}`;

  return llmJson(system, user);
}

// ----- Stage 3: validateClarification ----------------------------------

/**
 * 提案された追加質問が本当に必要・適切かを検証する。
 *
 * @returns {{ valid: boolean, approved_question: string|null, reason: string }}
 */
async function validateClarification({ question, clarifying_question, collectedSlots }) {
  const slotsText = Object.entries(collectedSlots || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ") || "（なし）";

  const system = `あなたはカスタマーサポートの会話品質チェックエージェントです。
以下のJSONのみ出力してください:
{
  "valid": true または false,
  "approved_question": "承認された追加質問（修正がある場合は修正後の文）またはnull",
  "reason": "判断の根拠"
}

追加質問が「有効（valid=true）」の条件:
1. ユーザーの質問に答えるために本当に必要な情報を聞いている
2. すでに収集済みの情報（slots）と重複していない
3. 礼儀正しく1文で完結している
4. 顧客を混乱させない（技術的すぎない）

上記を満たさない場合は valid=false とし、approved_question=null を返してください。`;

  const user = `ユーザーの質問: ${question}
収集済みスロット: ${slotsText}
提案された追加質問: ${clarifying_question}`;

  return llmJson(system, user);
}

// ----- Public API -------------------------------------------------------

/**
 * Stage 2 + 3 を実行し、最終方針を返す。
 *
 * @param {{ question: string, candidates: object[], collectedSlots: object }} opts
 * @returns {Promise<{
 *   action: "ANSWER"|"CLARIFY"|"ESCALATE",
 *   best_chunk_index: number|null,
 *   clarifying_question: string|null,
 *   plan: object
 * }>}
 */
export async function verifyAnswerPlan({ question, candidates, collectedSlots }) {
  if (!config.llm.apiKey || candidates.length === 0) {
    return { action: "ANSWER", best_chunk_index: null, clarifying_question: null, plan: null };
  }

  let plan;
  try {
    plan = await verifyAndPlan({ question, candidates });
    logger.info("verify-answer: plan", {
      action: plan.action,
      best_chunk_index: plan.best_chunk_index,
      interpretations: plan.interpretations?.length,
      reason: plan.reason,
    });
  } catch (err) {
    logger.warn("verify-answer: verifyAndPlan failed, falling back to ANSWER", { error: err?.message });
    return { action: "ANSWER", best_chunk_index: null, clarifying_question: null, plan: null };
  }

  // ESCALATE
  if (plan.action === "ESCALATE") {
    return { action: "ESCALATE", best_chunk_index: null, clarifying_question: null, plan };
  }

  // CLARIFY → Stage 3 で追加質問を検証
  if (plan.action === "CLARIFY" && plan.clarifying_question) {
    let validation;
    try {
      validation = await validateClarification({
        question,
        clarifying_question: plan.clarifying_question,
        collectedSlots,
      });
      logger.info("verify-answer: clarification validation", {
        valid: validation.valid,
        reason: validation.reason,
      });
    } catch (err) {
      logger.warn("verify-answer: validateClarification failed, falling back to ANSWER", { error: err?.message });
      return { action: "ANSWER", best_chunk_index: plan.best_chunk_index, clarifying_question: null, plan };
    }

    if (validation.valid && validation.approved_question) {
      return {
        action: "CLARIFY",
        best_chunk_index: null,
        clarifying_question: validation.approved_question,
        plan,
      };
    }
    // 追加質問が不適切 → ANSWER にフォールバック
    logger.info("verify-answer: clarification rejected, falling back to ANSWER");
  }

  // ANSWER
  const idx = plan.best_chunk_index != null ? plan.best_chunk_index - 1 : null; // 1-based → 0-based
  return { action: "ANSWER", best_chunk_index: idx, clarifying_question: null, plan };
}
