import { config } from "../config.js";

const EMBEDDING_MODEL = "text-embedding-3-small";

/**
 * テキストの埋め込みベクトルを生成する。
 * 失敗時は null を返す（呼び出し元は keyword search にフォールバックすること）。
 */
export async function generateEmbedding(text) {
  if (!config.llm.apiKey || !text?.trim()) return null;
  try {
    const res = await fetch(`${config.llm.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: String(text).slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * コサイン類似度を計算する（0〜1）。
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * チャンクの埋め込み用テキストを生成する。
 * タイトル + 本文（先頭600文字）を結合し意味的な文脈を与える。
 */
export function buildEmbeddingText(title, body) {
  return [title, String(body || "").slice(0, 600)].filter(Boolean).join("\n");
}

/**
 * JSON 文字列として保存された埋め込みをパースする。
 * 不正な場合は null を返す。
 */
export function parseStoredEmbedding(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
