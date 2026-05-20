/**
 * page-loading ツール
 * 指定 URL を fetch して HTTP ステータスとページタイトルを返す。
 * タイムアウト 5 秒。エラー時は { ok: false, error } を返す。
 */

export async function loadPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Ptengine-SupportBot/1.0" },
      });
      const text = await res.text().catch(() => "");
      const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim().slice(0, 100) : null;
      return { ok: res.ok, status: res.status, url, title };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const isTimeout = err?.name === "AbortError";
    return { ok: false, status: null, url, error: isTimeout ? "timeout" : String(err?.message ?? err) };
  }
}

/**
 * ユーザーメッセージからURLを抽出する。
 * @param {string} text
 * @returns {string[]}
 */
export function extractUrls(text) {
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  const trailingPunct = /[.,;:!?]+$/;
  const raw = text.match(urlPattern) ?? [];
  return [...new Set(raw.map(u => u.replace(trailingPunct, "")))];
}
