// ─────────────────────────────────────────────
// Knowledge Retrieval Interface
//
// category / message / slots から知識候補を検索する統一 interface。
// source ごとの実装差を吸収し、orchestrator / skill に共通 API を提供する。
//
// 返却形式 (KnowledgeCandidate[]):
//   { source_type, source_name, title, body, url,
//     confidence_hint, reason, published_to_bot }
//
// 設計方針:
//   - 取得失敗は空配列を返す (bot 全体を落とさない)
//   - allowedSourceTypes で取得対象を絞れる
//   - help_center は searchHelpCenter() で記事検索 + 本文フェッチ
//   - notion_faq / notion_cse は knowledge_chunks テーブルから検索 (未実装時は空)
//   - known_issue は nocodb-repo の known_issues テーブルから検索
// ─────────────────────────────────────────────

import { searchHelpCenter, fetchArticleBodyFromUrl } from "../skills/help-center-answer.js";
import { searchChunks } from "./chunks.js";
import { canExposeKnowledgeToCustomer } from "./policy-gate.js";

const DEFAULT_ALLOWED_SOURCE_TYPES = ["help_center", "notion_faq"];

/**
 * @typedef {Object} KnowledgeCandidate
 * @property {string|null} chunk_id     chunks テーブルの ID (help_center は null)
 * @property {string} source_type
 * @property {string} source_name
 * @property {string} title
 * @property {string} body
 * @property {string|null} url
 * @property {number} confidence_hint   0.0〜1.0 (高いほど関連性が高い推定)
 * @property {string|null} reason
 * @property {boolean} published_to_bot
 */

/**
 * category / message / slots に基づいて知識候補を検索する。
 *
 * @param {{
 *   category: string,
 *   latestUserMessage: string,
 *   collectedSlots?: Record<string, string|null>,
 *   allowedSourceTypes?: string[],
 *   limit?: number
 * }} opts
 * @returns {Promise<KnowledgeCandidate[]>}
 */
export async function retrieveKnowledgeCandidates({
  category,
  latestUserMessage,
  collectedSlots = {},
  allowedSourceTypes = DEFAULT_ALLOWED_SOURCE_TYPES,
  limit = 3
}) {
  const query = buildQuery(category, latestUserMessage, collectedSlots);
  const results = [];

  const fetchers = allowedSourceTypes.map((sourceType) =>
    fetchBySourceType(sourceType, query, collectedSlots, limit)
      .then((items) => results.push(...items))
      .catch(() => {})
  );
  await Promise.all(fetchers);

  // confidence_hint で降順ソート
  return results.sort((a, b) => b.confidence_hint - a.confidence_hint).slice(0, limit);
}

/**
 * source_type 別に検索を実行する。
 */
async function fetchBySourceType(sourceType, query, collectedSlots, limit) {
  switch (sourceType) {
    case "help_center":
      return fetchFromHelpCenter(query, limit);

    case "notion_faq":
      return fetchFromChunks("notion_faq", query, limit);

    case "notion_cse":
      // CSE は顧客返答不可だが retrieval 自体は可能 (policy gate で使い分ける)
      return fetchFromChunks("notion_cse", query, limit);

    case "known_issue":
      return fetchFromChunks("known_issue", query, limit);

    default:
      return [];
  }
}

/**
 * Help Center を検索してチャンク形式で返す。
 */
async function fetchFromHelpCenter(query, limit) {
  try {
    const articles = await searchHelpCenter(query);
    if (articles.length === 0) return [];

    const withBody = await Promise.all(
      articles.slice(0, limit).map(async (a) => {
        const body = await fetchArticleBodyFromUrl(a.url);
        return {
          chunk_id: null,
          source_type: "help_center",
          source_name: "ptengine_help_center",
          title: a.title,
          body: body || "",
          url: a.url,
          confidence_hint: 0.7,
          reason: "help_center_search",
          published_to_bot: true
        };
      })
    );
    return withBody;
  } catch {
    return [];
  }
}

/**
 * knowledge_chunks テーブルから source_type で検索する。
 */
async function fetchFromChunks(sourceType, query, limit) {
  try {
    const chunks = await searchChunks({ sourceTypes: [sourceType], query, limit });
    return chunks.map((c) => ({
      chunk_id: c.chunk_id || null,
      source_type: c.source_type,
      source_name: c.source_name,
      title: c.title,
      body: c.body,
      url: c.url,
      confidence_hint: c.freshness_score * 0.6,
      reason: `chunk_search:${sourceType}`,
      published_to_bot: c.published_to_bot
    }));
  } catch {
    return [];
  }
}

/**
 * category と slots から検索クエリを組み立てる。
 * 元の発話を常に補完として含め、slot が英語コードのみでも日本語チャンクへのマッチを保証する。
 *
 * @param {string} category
 * @param {string} latestUserMessage
 * @param {Record<string, string|null>} collectedSlots
 * @returns {string}
 */
export function buildQuery(category, latestUserMessage, collectedSlots) {
  const parts = [];

  if (category === "experience_issue") {
    if (collectedSlots?.experience_name) parts.push(collectedSlots.experience_name);
    if (collectedSlots?.symptom) {
      parts.push(collectedSlots.symptom);
      // symptom の FAQ 語彙展開: ユーザー表現 → FAQ タイトルの普通体表現
      const expanded = expandSymptomKeywords(collectedSlots.symptom);
      if (expanded) parts.push(expanded);
    }
  } else if (category === "usage_guidance") {
    if (collectedSlots?.target_feature) parts.push(collectedSlots.target_feature);
    if (collectedSlots?.user_goal) parts.push(collectedSlots.user_goal);
    if (collectedSlots?.feature_category) parts.push(collectedSlots.feature_category);
  } else {
    if (collectedSlots?.symptom) parts.push(collectedSlots.symptom);
  }

  // 元の発話を常に補完する (slot が英語コードでも日本語マッチを保証)
  const msgSlice = latestUserMessage.slice(0, 150);
  if (!parts.includes(msgSlice)) parts.push(msgSlice);

  return parts.join(" ");
}

/**
 * ユーザーの symptom 表現を FAQ 語彙（普通体・タグ語）に展開する。
 * FAQ タイトルが普通体のため、ユーザーの丁寧語・話し言葉との gap を埋める。
 *
 * @param {string} symptom
 * @returns {string} 追加キーワード (なければ空文字)
 */
function expandSymptomKeywords(symptom) {
  const s = symptom;
  const extra = [];
  if (/出ない|見えない|表示されません|表示されない|映らない/.test(s)) extra.push("表示されない 表示異常");
  if (/反映されません|反映されない|変わらない|効かない/.test(s)) extra.push("反映されない");
  if (/動かない|動きません|機能しない/.test(s)) extra.push("反映されない 表示異常");
  if (/おかしい|変|異常|ずれる|ズレ/.test(s)) extra.push("表示異常 データ異常");
  if (/計測されない|取れない|データがない|データなし/.test(s)) extra.push("データなし 計測");
  if (/差が出る|乖離|ずれ|ズレ|一致しない|合わない/.test(s)) extra.push("データ異常 乖離");
  if (/開けない|開かない|読み込めない|固まる|フリーズ/.test(s)) extra.push("読み込み異常");
  if (/公開.*?ない|本番.*?出ない|ライブ.*?出ない/.test(s)) extra.push("本番環境 表示されない");
  return extra.join(" ");
}

/**
 * 候補から顧客返答可のものだけをフィルタする (policy-gate.js のラッパー)。
 *
 * @param {KnowledgeCandidate[]} candidates
 * @returns {KnowledgeCandidate[]}
 */
export function filterExposable(candidates) {
  return candidates.filter((c) =>
    canExposeKnowledgeToCustomer({
      sourceType: c.source_type,
      publishedToBot: c.published_to_bot
    })
  );
}
