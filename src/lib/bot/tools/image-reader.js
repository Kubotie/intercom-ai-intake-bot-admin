/**
 * image-reading ツール
 *
 * Intercom webhook payload から画像添付 URL を抽出し、
 * LLM (vision) を使って内容を説明する。
 */

import { config } from "../config.js";

/**
 * Intercom webhook payload から画像 URL の配列を抽出する。
 * conversation.user.created / conversation.user.replied 両方に対応。
 */
export function extractImageAttachments(payload) {
  const urls = [];

  const item = payload?.data?.item ?? payload?.item ?? null;

  // source (created イベント)
  const sourceAttachments = item?.source?.attachments ?? [];
  for (const a of sourceAttachments) {
    if (isImageAttachment(a)) urls.push(a.url);
  }

  // conversation_parts (replied イベント)
  const parts = item?.conversation_parts?.conversation_parts
    ?? (Array.isArray(item?.conversation_parts) ? item.conversation_parts : []);
  for (const part of parts) {
    if (part?.author?.type !== "user") continue;
    for (const a of part?.attachments ?? []) {
      if (isImageAttachment(a)) urls.push(a.url);
    }
  }

  return [...new Set(urls)];
}

function isImageAttachment(attachment) {
  if (!attachment?.url) return false;
  const ct = attachment.content_type ?? "";
  if (ct.startsWith("image/")) return true;
  const url = attachment.url.toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/.test(url);
}

/**
 * 画像 URL リストを LLM vision API に渡して内容説明を取得する。
 * 最大 4 枚まで処理（コスト上限）。
 * @param {string[]} imageUrls
 * @returns {Promise<string|null>} 説明文。エラー時・空時は null。
 */
export async function describeImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return null;
  const targets = imageUrls.slice(0, 4);

  const content = [
    {
      type: "text",
      text: "以下の画像はサポート会話でユーザーが添付したスクリーンショットです。各画像について日本語で簡潔に説明してください（エラー画面、設定画面、計測結果など）。説明は箇条書きで記述し、200字以内にまとめてください。"
    },
    ...targets.map(url => ({
      type: "image_url",
      image_url: { url, detail: "low" }
    }))
  ];

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
        max_tokens: 300,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}
