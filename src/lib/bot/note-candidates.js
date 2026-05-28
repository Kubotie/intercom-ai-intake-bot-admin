// ─────────────────────────────────────────────
// note-candidates (確信度ベース分岐版)
//
// 以下の順で確信度を評価し、不確実な軸でだけ分岐する:
//   interpretation_confident + skill_confident → content で分岐
//   interpretation_confident のみ              → skill で分岐
//   どちらも不確実                              → interpretation で分岐
//
// さらに最良候補の回答品質が低いと判断された場合、
// 意図を再解釈した候補を追加する (is_reinterpretation: true)。
// ─────────────────────────────────────────────

import { config } from "./config.js";
import { retrieveKnowledgeCandidates, filterExposable } from "./knowledge/retrieval.js";

/**
 * @typedef {{
 *   interpretation: string,
 *   skill: string,
 *   source_title: string,
 *   source_url?: string,
 *   answer: string,
 *   is_reinterpretation?: boolean
 * }} AnswerCandidate
 *
 * @typedef {{
 *   branchAxis: "content" | "skill" | "interpretation",
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
      limit: 5,
    }),
    retrieveKnowledgeCandidates({
      category,
      latestUserMessage,
      collectedSlots,
      allowedSourceTypes: ["help_center"],
      limit: 5,
    }),
  ]);

  const faqChunks = filterExposable(faqResult.status === "fulfilled" ? faqResult.value : []).slice(0, 4);
  const hcChunks  = filterExposable(hcResult.status  === "fulfilled" ? hcResult.value  : []).slice(0, 4);

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
サポート担当者が「どの解釈・スキル・コンテンツが正しいか」を判断できるよう、
確信度ベースで最適な分岐軸を選び、候補を生成してください。

## 事前判定（最優先）
顧客の会話全体を読み、実質的な質問・課題・依頼が含まれているかを自然言語として判断してください。
挨拶のみ、感謝のみ、「解決しました」等の解決報告のみ、相づちのみ、
締め言葉のみなど、実際の問い合わせ内容を含まない場合は:
  message_type を "non_substantive" に設定し、candidates を空配列で返してください。
実質的な問い合わせを含む場合は message_type を "substantive" に設定し、
以降の Step を続けてください。

## Step 1: 確信度の評価（substantive のみ）
以下を boolean で評価してください:
- interpretation_confident: 質問の意図が一通りに絞れるか
- skill_confident: 使用すべきスキル（FAQ/Help Center）が明確か

## Step 2: 分岐軸の選択
評価結果に基づき branch_axis を選択:
- 両方 true  → "content"        （解釈もスキルも固い。参照コンテンツで分岐）
- 解釈のみ true → "skill"       （解釈は固い。どのスキルが最適か分岐）
- 解釈が false  → "interpretation"（質問の意図から分岐）

## Step 3: 候補生成
選択した branch_axis に沿って最大3候補を生成してください。
- content 分岐: interpretation と skill は統一し、source_title を変える
- skill 分岐:   interpretation は統一し、skill と source_title を変える
- interpretation 分岐: interpretation・skill・source_title すべてを変える

## Step 4: 回答品質チェック
最良候補でも回答が曖昧・情報不足と判断される場合、
意図の再解釈候補を1件追加してください (is_reinterpretation: true)。

## 回答文ルール
- 冒頭は「お世話になっております。」で始める
- 顧客名は「${customerLabel}」
- 社内情報・担当者名は含めない
- 各 answer は400文字以内
- 参照ナレッジにURLが含まれる場合は、そのURLをそのまま末尾に「詳細はこちら: https://...」と記載する（[URL] というプレースホルダーは絶対に使わない。URLがない場合はリンク行自体を省略する）

## カテゴリ集中ルール（重要）
- 回答は必ずカテゴリ「${category}」に直接関連する情報のみ使用すること
- 提供されたナレッジに該当カテゴリの情報が含まれない場合は、その候補を生成しない
- 関連性が低いコンテンツを無理に使って回答を作ることは禁止

## ハルシネーション防止ルール（最重要）
- 提供されたナレッジに明示されていない情報は一切含めない
- 推測・補完・一般論の補足は禁止
- 確信を持って回答できない場合は answer を「提供情報だけでは判断できません。担当者にて詳細をご確認ください。」のみにして source_title をそのタイトルにすること

## 返却形式（JSONのみ）
{
  "message_type": "substantive" | "non_substantive",
  "interpretation_confident": true,
  "skill_confident": true,
  "branch_axis": "content" | "skill" | "interpretation",
  "branch_reason": "分岐理由（30文字以内）",
  "candidates": [
    {
      "interpretation": "意図の解釈（20文字以内）",
      "skill": "FAQ" | "Help Center" | "事例マッチング",
      "source_title": "参照コンテンツのタイトル",
      "source_url": "URLまたは空文字",
      "answer": "顧客向け回答文（400文字以内）",
      "is_reinterpretation": false
    }
  ]
}`;

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

    if (parsed?.message_type === "non_substantive") return null;

    const candidates = Array.isArray(parsed?.candidates)
      ? parsed.candidates.filter(c => c?.interpretation && c?.skill && c?.answer).slice(0, 4)
      : [];

    if (candidates.length === 0) return null;

    return {
      branchAxis:   parsed.branch_axis   || "content",
      branchReason: parsed.branch_reason || "",
      candidates,
    };
  } catch {
    return null;
  }
}
