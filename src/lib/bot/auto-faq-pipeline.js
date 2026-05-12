/**
 * auto-faq-pipeline.js
 *
 * 会話 → FAQ 変換の多段サブエージェントパイプライン。
 *
 * Stage 1: 会話分析エージェント
 *   「根本原因」と「原因ごとの解決策」を構造化抽出する。
 *   診断質問（体験名は？等）は抽出しない。
 *
 * Stage 2: FAQ ドラフト生成エージェント
 *   「原因 → 解決策」形式でbot参照可能なFAQを生成する。
 *   ユーザーへの質問形式は禁止。
 *
 * Stage 3: 完全性・品質検証エージェント
 *   解決策の網羅性と診断質問混入の両方を検証する。
 *
 * Stage 4: 精製エージェント（Stage3 で問題が見つかった場合のみ）
 *   フィードバックを受けて FAQ を再生成する。
 */

import { config } from "./config.js";
import { logger } from "./logger.js";

const MAX_REFINEMENT_ROUNDS = 2;

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
 * @param {string} transcript
 * @returns {{
 *   main_problem: string,
 *   context: string,
 *   root_causes: string[],
 *   solution_per_cause: { cause: string, solution: string }[],
 *   universal_solutions: string[],
 *   key_facts: string[],
 *   category_hint: string
 * }}
 */
async function analyzeConversation(transcript) {
  const system = `あなたはカスタマーサポート会話の技術分析エージェントです。
以下の JSON のみを出力してください:
{
  "main_problem": "ユーザーが直面している具体的な問題（1〜2文）",
  "context": "問題が発生している技術的状況・環境・前提条件",
  "root_causes": [
    "問題が起きている技術的・設定的な根本原因1",
    "根本原因2"
  ],
  "solution_per_cause": [
    { "cause": "原因の短い説明", "solution": "その原因に対する具体的な解決手順" }
  ],
  "universal_solutions": [
    "全ての原因に共通して適用すべき解決策や注意事項"
  ],
  "key_facts": [
    "FAQに必ず含めるべき重要な技術情報・仕様・注意点"
  ],
  "category_hint": "Ptengine の機能カテゴリ名（例: HTML編集、ヒートマップ、ポップアップ）"
}

重要なルール:
- root_causes には「なぜ問題が起きているか」の技術的理由のみ記載する
- 「体験名は？」「パターンは？」などのサポート担当者がユーザーに聞いた診断質問は含めない
- 解決策が複数ある場合は solution_per_cause に全て列挙する（省略禁止）`;

  return llmJson(system, `以下の会話を分析してください:\n\n${transcript}`);
}

// ─── Stage 2: FAQ ドラフト生成 ───────────────────────────────────────────────

/**
 * @param {string} transcript
 * @param {object} analysis  Stage1 の結果
 * @returns {{ category: string, question: string, answer: string }}
 */
async function draftFaq(transcript, analysis) {
  const causeSolutions = (analysis.solution_per_cause ?? [])
    .map((cs, i) => `  ${i + 1}. 【原因】${cs.cause}\n     【解決策】${cs.solution}`)
    .join("\n");

  const universals = (analysis.universal_solutions ?? [])
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join("\n");

  const keyFacts = (analysis.key_facts ?? [])
    .map(f => `  - ${f}`)
    .join("\n");

  const analysisText = [
    `主な問題: ${analysis.main_problem}`,
    `文脈: ${analysis.context}`,
    causeSolutions ? `原因と解決策:\n${causeSolutions}` : null,
    universals      ? `共通の対処事項:\n${universals}` : null,
    keyFacts        ? `重要な技術情報:\n${keyFacts}` : null,
  ].filter(Boolean).join("\n\n");

  const system = `あなたはカスタマーサポートFAQ作成エージェントです。
以下の JSON のみを出力してください:
{
  "category": "カテゴリ名（簡潔な日本語）",
  "question": "ユーザーの問題を1文で表した質問",
  "answer": "解決方法の詳細回答"
}

answer の書き方ルール:
1. 「原因 → 解決策」の対応形式で記述する
   例: 「〜の場合は〜してください。〜の場合は〜が必要です。」
2. 「〜ですか？」「〜を教えてください」などユーザーへの質問は一切含めない
3. 全ての root_causes と solution_per_cause を網羅する
4. ボットが参照して直接ユーザーに回答できる文体にする（断定・指示形）
5. 番号付きリストまたは条件分岐で分かりやすく構造化する`;

  return llmJson(
    system,
    `分析結果:\n${analysisText}\n\n元会話（参考）:\n${transcript.slice(0, 2000)}`
  );
}

// ─── Stage 3: 完全性・品質検証 ──────────────────────────────────────────────

/**
 * @param {object} analysis
 * @param {object} draft
 * @returns {{
 *   quality_score: number,
 *   is_complete: boolean,
 *   missing_points: string[],
 *   contains_diagnostic_questions: boolean,
 *   over_generalized: boolean,
 *   feedback: string
 * }}
 */
async function verifyFaqCompleteness(analysis, draft) {
  const system = `あなたはFAQ品質検証エージェントです。
以下の JSON のみを出力してください:
{
  "quality_score": 0.0〜1.0,
  "is_complete": true または false,
  "missing_points": ["answer に含まれていない解決策・重要情報1", ...],
  "contains_diagnostic_questions": true または false,
  "over_generalized": true または false,
  "feedback": "改善すべき点の具体的な指摘"
}

検証項目:
1. 全ての root_causes に対応する解決策が answer に含まれているか
2. answer にユーザーへの診断質問（「〜ですか？」「〜を教えてください」等）が混入していないか
   → 含まれていれば contains_diagnostic_questions=true
3. 解決策が具体的か（一般論ではなく手順として記述されているか）

品質スコア基準:
- 1.0: 全解決策が具体的に記述され、診断質問なし
- 0.8: 主要解決策は含まれているが一部の詳細が不足
- 0.6: 重要な解決策が省略、または診断質問が混入している
- 0.4以下: 大幅な情報損失・診断質問の多用・過剰な一般化`;

  const requiredPoints = [
    ...(analysis.root_causes ?? []),
    ...(analysis.solution_per_cause ?? []).map(cs => `${cs.cause} → ${cs.solution}`),
    ...(analysis.universal_solutions ?? []),
    ...(analysis.key_facts ?? []),
  ];

  const verifyContent = `
必須要点（全て answer に含まれているべき内容）:
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
 * @param {object} draft
 * @param {object} verification
 * @param {object} analysis
 * @returns {{ category: string, question: string, answer: string }}
 */
async function refineFaq(draft, verification, analysis) {
  const causeSolutions = (analysis.solution_per_cause ?? [])
    .map((cs, i) => `  ${i + 1}. 【原因】${cs.cause} → 【解決策】${cs.solution}`)
    .join("\n");

  const system = `あなたはFAQ改善エージェントです。
検証フィードバックを受けて、FAQ回答を改善してください。
以下の JSON のみを出力してください:
{
  "category": "カテゴリ名",
  "question": "質問文",
  "answer": "改善された回答"
}

改善ルール:
- missing_points の内容を answer に追加する
- contains_diagnostic_questions=true の場合、「〜ですか？」「〜を教えてください」等の質問文を全て削除し、解決策の記述に置き換える
- 「原因 → 解決策」の対応形式を維持する
- ユーザーへの質問は一切含めない`;

  const refineContent = `
現在のドラフト:
質問: ${draft.question}
回答: ${draft.answer}

検証フィードバック:
- 品質スコア: ${verification.quality_score}
- 欠落ポイント: ${(verification.missing_points ?? []).join(" / ") || "なし"}
- 診断質問の混入: ${verification.contains_diagnostic_questions ? "あり（削除すること）" : "なし"}
- 過剰一般化: ${verification.over_generalized ? "あり" : "なし"}
- 改善指示: ${verification.feedback}

全解決策（必ず answer に含めること）:
${causeSolutions || "（なし）"}

共通対処:
${(analysis.universal_solutions ?? []).map((s, i) => `${i + 1}. ${s}`).join("\n") || "（なし）"}
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
    root_causes: analysis.root_causes?.length,
    solution_per_cause: analysis.solution_per_cause?.length,
  });

  // Stage 2
  logger.info("auto-faq-pipeline: Stage2 drafting FAQ");
  let draft = await draftFaq(transcript, analysis);
  logger.info("auto-faq-pipeline: Stage2 complete", { question: draft.question?.slice(0, 60) });

  const pipelineLog = { analysis, drafts: [draft], verifications: [] };

  // Stage 3 + 4 ループ
  for (let round = 0; round < MAX_REFINEMENT_ROUNDS; round++) {
    logger.info(`auto-faq-pipeline: Stage3 verifying (round ${round + 1})`);
    const verification = await verifyFaqCompleteness(analysis, draft);
    pipelineLog.verifications.push(verification);

    logger.info("auto-faq-pipeline: Stage3 result", {
      quality_score: verification.quality_score,
      is_complete: verification.is_complete,
      contains_diagnostic_questions: verification.contains_diagnostic_questions,
      missing_count: verification.missing_points?.length ?? 0,
    });

    const passesQuality = verification.is_complete
      && verification.quality_score >= 0.8
      && !verification.over_generalized
      && !verification.contains_diagnostic_questions;

    if (passesQuality) {
      logger.info("auto-faq-pipeline: quality OK, pipeline complete");
      break;
    }

    // Stage 4
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
