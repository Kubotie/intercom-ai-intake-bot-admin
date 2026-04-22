// ─────────────────────────────────────────────
// Knowledge Policy Gate
//
// source_type ごとに「顧客への直接回答に使えるか」を判定する。
// orchestrator / skill から共通利用する。
//
// ルール:
//   help_center  → 公開情報のため常に顧客返答可
//   notion_faq   → published_to_bot=true のものだけ顧客返答可
//   known_issue  → published_to_bot=true のものだけ顧客返答可
//   notion_cse   → 内部補助のみ。顧客返答には絶対に使わない
// ─────────────────────────────────────────────

/**
 * @typedef {"help_center"|"notion_faq"|"notion_cse"|"known_issue"} SourceType
 */

/** 顧客に直接返してよい source_type のデフォルトポリシー */
const DEFAULT_EXPOSURE_POLICY = {
  help_center:  true,
  notion_faq:   false, // published_to_bot フラグで個別判定
  known_issue:  false, // published_to_bot フラグで個別判定
  notion_cse:   false  // 内部補助のみ — 変更不可
};

/**
 * この source の知識を顧客回答に使えるかを判定する。
 *
 * @param {{ sourceType: SourceType, publishedToBot?: boolean }} opts
 * @returns {boolean}
 */
export function canExposeKnowledgeToCustomer({ sourceType, publishedToBot }) {
  switch (sourceType) {
    case "help_center":
      // 公開 Help Center は常に顧客返答可
      return true;

    case "notion_faq":
      // published_to_bot=true のものだけ顧客返答可
      // 未設定 (null/undefined) は安全側に倒して false
      return publishedToBot === true;

    case "known_issue":
      // published_to_bot=true のものだけ顧客返答可
      return publishedToBot === true;

    case "notion_cse":
      // 内部補助のみ — 絶対に顧客には返さない
      return false;

    default:
      // 未知の source_type は安全側に倒して false
      return false;
  }
}

/**
 * chunks の配列から顧客に返せるものだけをフィルタする。
 *
 * @param {Array<{source_type: SourceType, published_to_bot?: boolean}>} chunks
 * @returns {Array}
 */
export function filterExposableChunks(chunks) {
  return chunks.filter((c) =>
    canExposeKnowledgeToCustomer({
      sourceType: c.source_type,
      publishedToBot: c.published_to_bot
    })
  );
}

/**
 * source_type の一覧ポリシーを返す (ログ・デバッグ用)。
 */
export function getExposurePolicy() {
  return { ...DEFAULT_EXPOSURE_POLICY };
}
