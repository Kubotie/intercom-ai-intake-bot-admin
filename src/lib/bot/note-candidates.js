// ─────────────────────────────────────────────
// note-candidates (質問方向性ベース版)
//
// 顧客の質問から考えられる「質問の方向性」を 1〜3 個 LLM に検討させ、
// 各方向性ごとに複数の FAQ / Help Center チャンクを参照して
// 統合された最適回答を生成する。
// ─────────────────────────────────────────────

import { config } from "./config.js";
import { retrieveKnowledgeCandidates, filterExposable } from "./knowledge/retrieval.js";

/**
 * @typedef {{
 *   title: string,
 *   url?: string,
 *   skill: "FAQ" | "Help Center"
 * }} CandidateSource
 *
 * @typedef {{
 *   interpretation: string,
 *   sources: CandidateSource[],
 *   answer: string
 * }} AnswerCandidate
 *
 * @typedef {{
 *   branchAxis: "interpretation",
 *   branchReason: string,
 *   candidates: AnswerCandidate[]
 * }} CandidateResult
 */

/**
 * @param {{
 *   category: string,
 *   latestUserMessage: string,
 *   collectedSlots?: Record<string, string>,
 *   authorName?: string|null
 * }} opts
 * @returns {Promise<CandidateResult | null>}
 */
export async function generateAnswerCandidatesForNote({ category, latestUserMessage, collectedSlots = {}, authorName = null }) {
  if (!config.llm.apiKey || !category || !latestUserMessage) return null;

  // ── ソース別に並行取得 ────────────────────────────────────────────────
  const [faqResult, hcResult] = await Promise.allSettled([
    retrieveKnowledgeCandidates({
      category,
      latestUserMessage,
      collectedSlots,
      allowedSourceTypes: ["notion_faq"],
      limit: 6,
    }),
    retrieveKnowledgeCandidates({
      category,
      latestUserMessage,
      collectedSlots,
      allowedSourceTypes: ["help_center"],
      limit: 6,
    }),
  ]);

  const faqChunks = filterExposable(faqResult.status === "fulfilled" ? faqResult.value : []).slice(0, 6);
  const hcChunks  = filterExposable(hcResult.status  === "fulfilled" ? hcResult.value  : []).slice(0, 6);

  if (faqChunks.length === 0 && hcChunks.length === 0) return null;

  // ── ソース情報をラベル付きで整形 ─────────────────────────────────────
  const buildChunkText = (chunks, label) =>
    chunks.map(c =>
      `[${label}] タイトル: ${c.title}${c.url ? `\nURL: ${c.url}` : ""}\n本文: ${String(c.body || "").slice(0, 400)}`
    ).join("\n---\n");

  const sourceContext = [
    faqChunks.length > 0 ? buildChunkText(faqChunks, "FAQ")         : "",
    hcChunks.length  > 0 ? buildChunkText(hcChunks,  "Help Center") : "",
  ].filter(Boolean).join("\n\n===\n\n");

  // ── ユーザーコンテキスト ──────────────────────────────────────────────
  const customerLabel = authorName ? `${authorName}様` : "お客様";
  const slotContext   = Object.entries(collectedSlots)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  const userQuery = [latestUserMessage, slotContext].filter(Boolean).join(" / ");

  const systemPrompt = `あなたはPtengineのカスタマーサポートアドバイザーです。
サポート担当者が「この顧客にどんな方向性で回答すべきか」を判断できるよう、
顧客の質問から考えられる「質問の方向性」を 1〜3 個抽出し、
各方向性ごとに**複数の FAQ / Help Center チャンクを統合**して最適解を生成してください。

## 事前判定（最優先）— message_type は以下 4 種から 1 つだけ選ぶ

### "non_substantive"（候補生成しない）
挨拶のみ、感謝のみ、「解決しました」等の解決報告のみ、相づちのみ、
締め言葉のみなど、実際の問い合わせ内容を含まない場合。

### "vague_support_request"（候補生成しない）
顧客が「サポートいただけますか」「教えてください」「お時間ありますか」「ご相談させてください」のように、
**助けを求める意思表示はあるが具体的に何を相談したいかが特定できない**場合。
特に以下に該当：
- 機能名・症状・エラー内容・目的のいずれも明示されていない
- 「設定の件で」など対象領域が曖昧で、何の設定かが特定できない
- 自己紹介・前置きが大半で、本題が未提示
このような状態でナレッジを当てはめると顧客の意図と無関係な FAQ を提示してしまうため、
**必ず candidates を空配列で返すこと**。

### "agent_action_required"（候補生成しない）
顧客がエージェントに対し**顧客固有データの個別調査・確認・操作**を依頼している場合。
特徴：
- 顧客自身の URL・体験名・イベント名・プロジェクト名・契約内容など固有情報が含まれる
- 「ご確認ください」「確認していただけますか」「見ていただけますか」「調査してください」等
- FAQ や Help Center の一般知識では応答できず、エージェントが実際に Ptengine 画面や契約情報を見る必要がある
このケースで一般的な FAQ を提示すると的外れになるため、**必ず candidates を空配列で返すこと**。
（「使い方を教えてください」「機能はありますか」のような一般質問は agent_action_required ではなく substantive）

### "substantive"（候補生成する）
上記 3 種いずれにも該当せず、FAQ または Help Center の知識で具体的に回答可能な質問・相談を含む場合のみ、
以降の Step を続けて candidates を生成してください。

## Step 1: 質問の方向性の抽出（1〜3 個）
顧客の質問から、対応すべき「質問の方向性」を意味的に独立した形で 1〜3 個抽出してください。
- 解釈が一通りに絞れて成立する方向性が 1 つだけなら 1 候補のみで返すこと（無理に候補を増やさない）
- 別解釈・別の側面で問い合わせの可能性がある場合は 2〜3 候補
- 同じ方向性の言い換えで複数生成しないこと（候補同士は意味的に明確に異なること）

## Step 2: 各方向性の最適回答の合成
各方向性について:
- 提供された FAQ / Help Center チャンクの中から、その方向性に関連する**複数のチャンク**を選び出す
- 必要に応じて FAQ と Help Center をまたいで参照する
- 選んだチャンクの情報を統合し、顧客向けの最適な回答文を作る
- 単一チャンクで十分カバーできる場合は 1 件参照でも構わない
- 関連しない情報は混ぜないこと
- sources 配列に参照したチャンクのタイトル・URL（あれば）・スキル区分（FAQ または Help Center）を全て列挙

## 回答文ルール
- 冒頭は「お世話になっております。」で始める
- 顧客名は「${customerLabel}」
- 社内情報・担当者名は含めない
- 各 answer は 500 文字以内
- 参照ナレッジに URL が含まれる場合は、回答末尾に URL を「詳細はこちら: https://...」で記載する（[URL] というプレースホルダーは絶対に使わない。URL がない場合はリンク行自体を省略する）

## カテゴリ集中ルール（重要）
- 回答は必ずカテゴリ「${category}」に直接関連する情報のみ使用すること
- 提供されたナレッジに該当カテゴリの情報が含まれない場合は、その候補を生成しない
- 関連性が低いコンテンツを無理に使って回答を作ることは禁止

## ハルシネーション防止ルール（最重要）
- 提供されたナレッジに明示されていない情報は一切含めない
- 推測・補完・一般論の補足は禁止
- 確信を持って回答できない場合は answer を「提供情報だけでは判断できません。担当者にて詳細をご確認ください。」のみにして sources を空配列にすること

## 返却形式（JSONのみ）
{
  "message_type": "substantive" | "non_substantive" | "vague_support_request" | "agent_action_required",
  "branch_reason": "1〜3つの方向性を選定した理由（30文字以内）。substantive 以外の場合は判定理由",
  "candidates": [
    {
      "interpretation": "質問の方向性（30文字以内）",
      "sources": [
        { "title": "FAQタイトル", "url": "URLまたは空文字", "skill": "FAQ" | "Help Center" }
      ],
      "answer": "顧客向け回答文（500文字以内、複数sourceの情報を統合）"
    }
  ]
}
※ substantive 以外の場合は candidates を必ず空配列 [] にすること。`;

  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: `顧客の会話（全メッセージ）:\n${userQuery}\n\n参照ナレッジ:\n${sourceContext}` },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) return null;

    const content = data?.choices?.[0]?.message?.content;
    const trimmed = String(content || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end   = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) parsed = JSON.parse(trimmed.slice(start, end + 1));
      else return null;
    }

    // substantive 以外は候補生成しない（候補の質を担保するためのガード）
    const NON_CANDIDATE_TYPES = new Set([
      "non_substantive",
      "vague_support_request",
      "agent_action_required",
    ]);
    if (NON_CANDIDATE_TYPES.has(parsed?.message_type)) return null;

    const candidates = Array.isArray(parsed?.candidates)
      ? parsed.candidates
          .filter(c => c?.interpretation && c?.answer && Array.isArray(c?.sources))
          .map(c => ({
            interpretation: String(c.interpretation),
            sources: c.sources
              .filter(s => s?.title)
              .map(s => ({
                title: String(s.title),
                url:   s.url ? String(s.url) : "",
                skill: s.skill === "Help Center" ? "Help Center" : "FAQ",
              })),
            answer: String(c.answer),
          }))
          .slice(0, 3)
      : [];

    if (candidates.length === 0) return null;

    return {
      branchAxis:   "interpretation",
      branchReason: parsed.branch_reason || "",
      candidates,
    };
  } catch {
    return null;
  }
}
