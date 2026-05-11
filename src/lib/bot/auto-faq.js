/**
 * auto-faq.js
 *
 * Intercom の conversation_part.tag.created webhook を受けて、
 * 会話を自動で FAQ 化し Notion FAQ2 DB → NocoDB knowledge_chunks に同期する。
 *
 * トリガータグ: 環境変数 AUTO_FAQ_TAG_NAME (デフォルト: "FAQ化")
 */

import { config } from "./config.js";
import { logger } from "./logger.js";
import { createFaqPage } from "./knowledge/notion-client.js";
import { syncNotionFaq2 } from "./knowledge/sync-notion-faq2.js";

const AUTO_FAQ_TAG = () => (process.env.AUTO_FAQ_TAG_NAME ?? "FAQ化").trim();

// ─── HTML → プレーンテキスト ─────────────────────────────────────────────────

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Intercom API ────────────────────────────────────────────────────────────

async function fetchIntercomConversation(conversationId) {
  const token = process.env.INTERCOM_TOKEN;
  if (!token) throw new Error("INTERCOM_TOKEN is not set");

  const res = await fetch(`https://api.intercom.io/conversations/${conversationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Intercom-Version": "2.10",
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Intercom API error (${res.status}): ${err.slice(0, 200)}`);
  }
  return res.json();
}

function extractConversationText(conversation) {
  const parts = [];

  // 最初のユーザーメッセージ
  const firstMsg = conversation?.conversation_message?.body;
  if (firstMsg) {
    const text = stripHtml(firstMsg);
    if (text) parts.push({ role: "user", text });
  }

  // 会話パーツ（ユーザー発話 + ボット/エージェント返信）
  for (const part of conversation?.conversation_parts?.conversation_parts ?? []) {
    const body = part?.body;
    if (!body) continue;
    const text = stripHtml(body);
    if (!text || text === " ") continue;

    const authorType = part?.author?.type ?? "bot";
    const role = authorType === "user" ? "user" : "bot";
    parts.push({ role, text });
  }

  return parts;
}

// ─── LLM FAQ 生成 ────────────────────────────────────────────────────────────

async function generateFaqFromConversation(conversationParts) {
  const transcript = conversationParts
    .map(p => `${p.role === "user" ? "【ユーザー】" : "【サポート】"} ${p.text}`)
    .join("\n");

  const systemPrompt = `あなたはカスタマーサポートの専門家です。
サポート会話からFAQエントリを1件作成してください。
以下の JSON のみ出力してください（コードブロック不要）:
{
  "category": "FAQ のカテゴリ名（簡潔な日本語）",
  "question": "ユーザーの主な疑問・問題（日本語、1文）",
  "answer": "解決方法・回答（日本語、簡潔かつ具体的に）"
}`;

  const userPrompt = `以下の会話をFAQ化してください:\n\n${transcript}`;

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
    else throw new Error(`LLM returned non-JSON: ${cleaned.slice(0, 300)}`);
  }

  return {
    category: String(parsed.category ?? "サポートFAQ"),
    question: String(parsed.question ?? ""),
    answer:   String(parsed.answer   ?? ""),
  };
}

// ─── タグペイロード解析 ──────────────────────────────────────────────────────

export function extractTagEvent(payload) {
  // conversation_part.tag.created ペイロード:
  // { topic: "conversation_part.tag.created", data: { item: { type: "conversation_part", conversation_id: "...", tag: { name: "..." } } } }
  // または conversation.id を持つ場合:
  // { ..., data: { item: { type: "conversation_part", conversation: { id: "..." }, tag: { name: "..." } } } }
  // フォールバック: 旧形式 conversation.tag.created も処理できるよう残す
  const item = payload?.data?.item ?? {};

  let tagName = null;
  let conversationId = null;

  if (item.type === "conversation_part_tag" || item.type === "conversation_part") {
    // conversation_part.tag.created: item.type は "conversation_part_tag"
    tagName = item.tag?.name ?? null;
    conversationId = item.conversation?.id ?? item.conversation_id ?? null;
  } else if (item.type === "tag") {
    tagName = item.name ?? null;
    conversationId = item.applied_to?.id ?? null;
  } else if (item.type === "conversation") {
    conversationId = item.id ?? null;
    const tags = item.tags?.tags ?? item.tags ?? [];
    if (Array.isArray(tags) && tags.length > 0) {
      tagName = tags[tags.length - 1]?.name ?? null;
    }
  }

  return { tagName, conversationId };
}

// ─── メインエントリ ──────────────────────────────────────────────────────────

/**
 * conversation.tag.created webhook を受けて FAQ 自動生成・登録を実行する。
 *
 * @param {object} payload  Intercom webhook ペイロード
 * @returns {Promise<{ skipped: boolean, reason?: string, notion_page_id?: string, sync_stats?: object }>}
 */
export async function processAutoFaq(payload) {
  const { tagName, conversationId } = extractTagEvent(payload);

  const triggerTag = AUTO_FAQ_TAG();
  logger.info("auto-faq: tag event received", { tagName, conversationId, triggerTag });

  // タグ名が一致しない場合はスキップ
  if (!tagName || tagName !== triggerTag) {
    return { skipped: true, reason: `tag "${tagName}" is not the trigger tag "${triggerTag}"` };
  }
  if (!conversationId) {
    return { skipped: true, reason: "conversation_id not found in payload" };
  }

  const ctx = { tag_name: tagName, conversation_id: conversationId };

  // 1. 会話取得
  logger.info("auto-faq: fetching conversation", ctx);
  const conversation = await fetchIntercomConversation(conversationId);
  const parts = extractConversationText(conversation);

  if (parts.length === 0) {
    logger.warn("auto-faq: no conversation parts found", ctx);
    return { skipped: true, reason: "empty conversation" };
  }

  // 2. LLM で Q/A 生成
  logger.info("auto-faq: generating FAQ via LLM", { ...ctx, parts_count: parts.length });
  const faq = await generateFaqFromConversation(parts);
  logger.info("auto-faq: FAQ generated", { ...ctx, question: faq.question.slice(0, 80) });

  // 3. Notion に作成
  const databaseId = process.env.NOTION_FAQ2_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_FAQ2_DATABASE_ID is not set");

  const page = await createFaqPage(databaseId, {
    category: faq.category,
    question: faq.question,
    answer:   faq.answer,
    memo:     `Intercom 会話 #${conversationId} から自動生成`,
  });
  logger.info("auto-faq: Notion page created", { ...ctx, notion_page_id: page.id });

  // 4. NocoDB に同期
  const syncStats = await syncNotionFaq2();
  logger.info("auto-faq: sync complete", { ...ctx, ...syncStats });

  return { skipped: false, notion_page_id: page.id, faq, sync_stats: syncStats };
}
