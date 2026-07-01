// ─────────────────────────────────────────────
// completion-check
//
// 顧客からのメッセージが「完結しているか」LLM で判定する。
// 未完了と判定された場合、Bot 返信を保留してユーザーの続き入力を待つ。
//
// 返却:
//   status:
//     "complete":                明確な質問構造で完結 (即処理OK)
//     "possibly_complete":       完結に近いが追加可能性あり (処理OK)
//     "incomplete_with_progress": 何か内容はあるが未完了 (待機して再判定 → 保守的に処理)
//     "incomplete_empty":         内容がほぼゼロ (待機 → 諦めて監視終了)
//   reason: 判定理由 (ログ用)
// ─────────────────────────────────────────────

import { config } from "./config.js";
import { logger } from "./logger.js";

const SYSTEM_PROMPT = `あなたはカスタマーサポートの受付アシスタントです。
顧客からのメッセージが「質問として完結しているか」を判定してください。

判定は以下 4 値のいずれかで返します:

- "complete": 何を相談したいかが明確で、質問構造が完成している。
  例: 「ヒートマップの設定方法を教えてください」「A/Bテストの配信比率がおかしいです、原因は？」

- "possibly_complete": 主要な内容は伝わっているが、続きの補足が来る可能性もある。
  ボーダーラインは complete 側に倒す。
  例: 「CTAクリックのイベントが計測されないのですが」（症状は明確、追加詳細が続くかも）

- "incomplete_with_progress": 何か内容や文脈は含まれているが、質問として不完全。
  文末が継続を示唆する接続助詞（「が、」「ですが、」「について、」等）で止まっている場合や、
  導入文だけで本題が未提示の場合。
  例: 「先日相談した件について、」「ヒートマップの件で伺いたいのですが、」

- "incomplete_empty": 内容が実質空で、続きが来なければ処理不能。
  挨拶のみ、「サポートいただけますか」「教えてください」だけ、
  相手の存在確認だけの文（本題ゼロ）。
  例: 「お世話になっております」「サポートいただけますか」「小清水です、こんにちは」

## 重要判定ポイント

- 顧客固有情報の確認依頼 ("下記URLを確認してください" 等) は content があるため complete 扱い
- 挨拶 + 具体的質問 (例: 「お世話になっております。ヒートマップの設定を教えてください」) は complete
- 短くても具体的な質問 (例: 「解約したいです」) は complete
- 長くても導入文だけで本題不在なら incomplete_empty または incomplete_with_progress
- 判断に迷う場合は complete 寄りに倒す (Bot を待たせ過ぎない)

## 返却形式 (JSONのみ)
{
  "status": "complete" | "possibly_complete" | "incomplete_with_progress" | "incomplete_empty",
  "reason": "判定理由 (60文字以内)"
}`;

/**
 * @param {{ latestUserMessage: string, conversationHistorySummary?: string|null }} opts
 * @returns {Promise<{ status: string, reason: string }>}
 */
export async function checkMessageCompleteness({ latestUserMessage, conversationHistorySummary = null }) {
  if (!config.llm.apiKey || !latestUserMessage) {
    return { status: "complete", reason: "llm unavailable or empty message → fallback complete" };
  }

  const contextBlock = conversationHistorySummary
    ? `\n\n## 過去の会話サマリ (参考):\n${conversationHistorySummary}`
    : "";

  const userContent = `## 顧客の最新メッセージ:\n${latestUserMessage}${contextBlock}`;

  try {
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userContent },
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      logger.warn("completion-check: LLM error, fallback to complete", { error: data?.error });
      return { status: "complete", reason: "llm error → fallback complete" };
    }

    const content = data?.choices?.[0]?.message?.content;
    const trimmed = String(content || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const start = trimmed.indexOf("{");
      const end   = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) parsed = JSON.parse(trimmed.slice(start, end + 1));
      else return { status: "complete", reason: "invalid llm response → fallback complete" };
    }

    const VALID = new Set(["complete", "possibly_complete", "incomplete_with_progress", "incomplete_empty"]);
    const status = VALID.has(parsed?.status) ? parsed.status : "complete";
    const reason = String(parsed?.reason || "").slice(0, 200);

    return { status, reason };
  } catch (err) {
    logger.warn("completion-check: exception, fallback to complete", { error: err?.message });
    return { status: "complete", reason: `exception → fallback complete: ${err?.message}` };
  }
}

/**
 * status が「処理してよい」を意味するか
 */
export function isCompletionReadyToProcess(status) {
  return status === "complete" || status === "possibly_complete" || status === "incomplete_with_progress";
}

/**
 * status が「まだ待つべき」を意味するか (empty のみ完全に諦める対象)
 */
export function isCompletionShouldWait(status) {
  return status === "incomplete_empty" || status === "incomplete_with_progress";
}
