/**
 * auto-faq-pipeline.js
 *
 * 会話 → FAQ 変換の多段サブエージェントパイプライン。
 *
 * Stage 1: 会話分析エージェント
 *   会話から「問題」「確認事項」「解決ステップ」「文脈」を構造化抽出する。
 *   この段階では要約を禁止し、全ての重要ポイントを列挙させる。
 *
 * Stage 2: FAQ ドラフト生成エージェント
 *   Stage1 の分析結果を使い、全要点を含む詳細な FAQ を作成する。
 *
 * Stage 3: 完全性検証エージェント
 *   ドラフトと Stage1 分析を照合し、抜け漏れ・過剰な一般化を検出する。
 *
 * Stage 4: 精製エージェント (Stage3 で問題が見つかった場合のみ)
 *   検証フィードバックを受けて FAQ を再生成する。
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

const MAX_REFINEMENT_ROUNDS = 2; // 精製の最大繰り返し回数

// ─── LLM 共通 ────────────────────────────────────────────────────────────────

async function llmJson(systemPrompt, userContent, temperature = 0) {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "").trim();

  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`non-JSON from LLM: ${raw.slice(0, 300)}`);
  }
}

// ─── Stage 1: 会話分析 ───────────────────────────────────────────────────────

/**
 * @param {string} transcript  会話テキスト
 * @returns {{
 *   main_problem: string,
 *   context: string,
 *   investigation_points: string[],
 *   solution_steps: string[],
 *   key_requirements: string[],
 *   category_hint: string
 * }}
 */
async function analyzeConversation(transcript) {
  const system = `あなたはカスタマーサポート会話の分析エージェントです。
以下の JSON のみを出力してください（要約・省略禁止。全ての重要ポイントを列挙すること）:
{
  "main_problem": "ユーザーが直面している具体的な問題（1〜2文）",
  "context": "問題が発生している状況・環境・前提条件",
  "investigation_points": ["確認すべき事項1", "確認すべき事項2", ...],
  "solution_steps": ["解決手順1", "解決手順2", ...],
  "key_requirements": ["FAQ に必ず含めるべき重要ポイント1", "重要ポイント2", ...],
  "category_hint": "Ptengine の機能カテゴリ名（例: HTML編集、ヒートマップ、ポップアップ）"
}

重要: investigation_points と solution_steps は省略せず、会話に登場した全ての観点を列挙してください。`;

  return llmJson(system, `以下の会話を分析してください:\n\n${transcript}`);
}

// ─── Stage 2: FAQ ドラフト生成 ───────────────────────────────────────────────

/**
 * @param {string} transcript  会話テキスト
 * @param {object} analysis    Stage1 の結果
 * @returns {{ category: string, question: string, answer: string }}
 */
async function draftFaq(transcript, analysis) {
  const analysisText = [
    `主な問題: ${analysis.main_problem}`,
    `文脈: ${analysis.context}`,
    analysis.investigation_points?.length
      ? `確認事項:\n${analysis.investigation_points.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}`
      : null,
    analysis.solution_steps?.length
      ? `解決ステップ:\n${analysis.solution_steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`
      : null,
    analysis.key_requirements?.length
      ? `必須ポイント:\n${analysis.key_requirements.map(r => `  - ${r}`).join("\n")}`
      : null,
  ].filter(Boolean).join("\n\n");

  const system = `あなたはカスタマーサポートFAQ作成エージェントです。
以下の JSON のみを出力してください:
{
  "category": "カテゴリ名（簡潔な日本語）",
  "question": "ユーザーの問題を1文で表した質問",
  "answer": "解決方法の詳細回答（番号付き手順・確認事項を全て含める。省略しない。）"
}

ルール:
- answer には「確認事項」「解決ステップ」「必須ポイント」を全て含めること
- 「簡潔に」まとめるのではなく、サポート担当者が確認する全ての手順を網羅すること
- 顧客が自己解決できるよう具体的に記述すること`;

  return llmJson(
    system,
    `分析結果:\n${analysisText}\n\n元会話（参考）:\n${transcript.slice(0, 2000)}`
  );
}

// ─── Stage 3: 完全性検証 ────────────────────────────────────────────────────

/**
 * @param {object} analysis  Stage1 の結果
 * @param {object} draft     Stage2 の FAQ ドラフト
 * @returns {{
 *   quality_score: number,
 *   is_complete: boolean,
 *   missing_points: string[],
 *   over_generalized: boolean,
 *   feedback: string
 * }}
 */
async function verifyFaqCompleteness(analysis, draft) {
  const system = `あなたはFAQ品質検証エージェントです。
会話分析の要点がFAQドラフトに全て含まれているか検証してください。
以下の JSON のみを出力してください:
{
  "quality_score": 0.0〜1.0,
  "is_complete": true または false,
  "missing_points": ["ドラフトに含まれていない重要ポイント1", ...],
  "over_generalized": true または false （具体的な手順が抽象化・省略されている場合）,
  "feedback": "改善すべき点の具体的な指摘"
}

質スコアの基準:
- 1.0: 全ての確認事項・解決ステップが具体的に記述されている
- 0.8: 主要ポイントは含まれているが一部の詳細が不足
- 0.6: 重要な手順が省略されている
- 0.4以下: 大幅な情報損失または過剰な一般化`;

  const requiredPoints = [
    ...(analysis.investigation_points ?? []),
    ...(analysis.solution_steps ?? []),
    ...(analysis.key_requirements ?? []),
  ];

  const verifyContent = `
分析で抽出された必須要点:
${requiredPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

FAQドラフト:
カテゴリ: ${draft.category}
質問: ${draft.question}
回答: ${draft.answer}
`;

  return llmJson(system, verifyContent);
}

// ─── Stage 4: 精製 ───────────────────────────────────────────────────────────

/**
 * @param {object} draft       Stage2 のドラフト
 * @param {object} verification Stage3 の検証結果
 * @param {object} analysis    Stage1 の分析
 * @returns {{ category: string, question: string, answer: string }}
 */
async function refineFaq(draft, verification, analysis) {
  const system = `あなたはFAQ改善エージェントです。
検証フィードバックを受けて、FAQ回答を改善してください。
以下の JSON のみを出力してください:
{
  "category": "カテゴリ名",
  "question": "質問文",
  "answer": "改善された回答（missing_pointsを全て追加し、over_generalizedな箇所を具体化すること）"
}`;

  const refineContent = `
現在のドラフト:
質問: ${draft.question}
回答: ${draft.answer}

検証フィードバック:
- 品質スコア: ${verification.quality_score}
- 欠落ポイント: ${(verification.missing_points ?? []).join(" / ") || "なし"}
- 過剰一般化: ${verification.over_generalized ? "あり" : "なし"}
- 改善指示: ${verification.feedback}

確認事項（全て answer に含めること）:
${(analysis.investigation_points ?? []).map((p, i) => `${i + 1}. ${p}`).join("\n")}

解決ステップ（全て answer に含めること）:
${(analysis.solution_steps ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;

  return llmJson(system, refineContent, 0.2);
}

// ─── パイプライン本体 ────────────────────────────────────────────────────────

/**
 * 会話テキストから多段検証を経て最終 FAQ を生成する。
 *
 * @param {{ role: "user"|"bot", text: string }[]} conversationParts
 * @returns {Promise<{ category: string, question: string, answer: string, pipeline_log: object }>}
 */
export async function generateFaqWithPipeline(conversationParts) {
  const transcript = conversationParts
    .map(p => `${p.role === "user" ? "【ユーザー】" : "【サポート】"} ${p.text}`)
    .join("\n");

  // Stage 1
  logger.info("auto-faq-pipeline: Stage1 analyzing conversation");
  const analysis = await analyzeConversation(transcript);
  logger.info("auto-faq-pipeline: Stage1 complete", {
    investigation_points: analysis.investigation_points?.length,
    solution_steps: analysis.solution_steps?.length,
  });

  // Stage 2
  logger.info("auto-faq-pipeline: Stage2 drafting FAQ");
  let draft = await draftFaq(transcript, analysis);
  logger.info("auto-faq-pipeline: Stage2 complete", { question: draft.question?.slice(0, 60) });

  const pipelineLog = {
    analysis,
    drafts: [draft],
    verifications: [],
  };

  // Stage 3 + 4 ループ
  for (let round = 0; round < MAX_REFINEMENT_ROUNDS; round++) {
    logger.info(`auto-faq-pipeline: Stage3 verifying (round ${round + 1})`);
    const verification = await verifyFaqCompleteness(analysis, draft);
    pipelineLog.verifications.push(verification);

    logger.info("auto-faq-pipeline: Stage3 result", {
      quality_score: verification.quality_score,
      is_complete: verification.is_complete,
      missing_count: verification.missing_points?.length ?? 0,
    });

    if (verification.is_complete && verification.quality_score >= 0.8 && !verification.over_generalized) {
      logger.info("auto-faq-pipeline: quality OK, pipeline complete");
      break;
    }

    // Stage 4: 精製
    logger.info(`auto-faq-pipeline: Stage4 refining (round ${round + 1})`);
    draft = await refineFaq(draft, verification, analysis);
    pipelineLog.drafts.push(draft);
    logger.info("auto-faq-pipeline: Stage4 complete", { question: draft.question?.slice(0, 60) });
  }

  return {
    category: String(draft.category ?? analysis.category_hint ?? "サポートFAQ"),
    question: String(draft.question ?? ""),
    answer:   String(draft.answer   ?? ""),
    pipeline_log: pipelineLog,
  };
}
