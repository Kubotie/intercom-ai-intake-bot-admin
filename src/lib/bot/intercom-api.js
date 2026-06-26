import { config } from "./config.js";

async function icFetch(path, options = {}) {
  const res = await fetch(`${config.intercom.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.intercom.accessToken}`,
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`Intercom request failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

export async function replyToConversation(conversationId, messageBody, adminId) {
  return icFetch(`/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      type: "admin",
      admin_id: adminId || config.intercom.adminId,
      body: messageBody,
      message_type: "comment"
    })
  });
}

const SKILL_LABEL = {
  help_center_answer:       "Help Center 検索",
  faq_answer:               "Notion FAQ",
  known_bug_match:          "既知バグ照合",
  troubleshoot_case_answer: "事例マッチング",
  agentic_message:          "Agentic Loop（動的対話）",
  next_message:             "スロット収集（次質問）",
  handoff:                  "ハンドオフ",
  escalation:               "エスカレーション",
  fallback:                 "フォールバック",
};

const REJECTION_LABEL = {
  not_handled:               "該当なし",
  missing_answer_type:       "回答形式エラー",
  empty_answer_message:      "回答が空",
  confidence_below_threshold: "信頼度不足",
  exception:                 "実行エラー",
};

/**
 * @param {{
 *   replySource: string,
 *   sources: Array<{ title: string, url?: string }>,
 *   candidateResults?: Array<{ skill_name: string, accepted: boolean, confidence: number, rejection_reason: string|null }>
 * }} skillMeta
 */
function buildSkillMetaHtml(skillMeta) {
  if (!skillMeta) return "";
  const { replySource, sources = [], candidateResults = [] } = skillMeta;

  let html = "<br><br><hr>";

  if (candidateResults.length > 0) {
    // 試行した全スキルを採否付きで列挙
    html += "<b>📌 試行スキル:</b><br>";
    html += candidateResults.map((c) => {
      const label = SKILL_LABEL[c.skill_name] ?? c.skill_name;
      if (c.accepted) {
        const pct = c.confidence > 0 ? ` (${Math.round(c.confidence * 100)}%)` : "";
        return `• ${label}: <b>採用 ✓</b>${pct}`;
      }
      const reason = REJECTION_LABEL[c.rejection_reason] ?? (c.rejection_reason ?? "不採用");
      const pct    = c.confidence > 0 ? ` (${Math.round(c.confidence * 100)}%)` : "";
      return `• ${label}: 不採用 — ${reason}${pct}`;
    }).join("<br>");
  } else {
    // スキルオーケストレーターを経由しないケース（handoff / escalation 等）
    const label = SKILL_LABEL[replySource] ?? replySource;
    html += `<b>📌 使用スキル:</b> ${label}`;
  }

  const valid = sources.filter((s) => s?.title).slice(0, 5);
  if (valid.length > 0) {
    html += "<br><b>📚 参照情報:</b><br>";
    html += valid.map((s) =>
      s.url ? `• <a href="${s.url}">${s.title}</a>` : `• ${s.title}`
    ).join("<br>");
  }

  return html;
}

const CIRCLE_NUMS = ["①", "②", "③", "④", "⑤"];

/**
 * note モード: 質問方向性ベースの複数回答候補（各候補は複数 source を統合）を担当者向けに整形する。
 * @param {{ branchAxis: string, branchReason: string, candidates: Array<{ interpretation: string, sources: Array<{ title: string, url?: string, skill: string }>, answer: string }> }} candidateResult
 * @param {object|null} skillMeta
 */
function buildMultiCandidateNoteBody(candidateResult, skillMeta) {
  const { branchReason, candidates } = candidateResult;

  let html = `🤖 AI回答案（参考）— ${candidates.length}候補:<br>`;
  html += `<small>📊 質問の方向性で分岐`;
  if (branchReason) html += ` （${branchReason}）`;
  html += `</small><br><br>`;

  for (let i = 0; i < candidates.length; i++) {
    const { interpretation, sources, answer } = candidates[i];
    const num = CIRCLE_NUMS[i] ?? `(${i + 1})`;

    html += `<b>${num} ${interpretation}</b><br>`;

    if (Array.isArray(sources) && sources.length > 0) {
      for (const s of sources) {
        const link = s.url ? `<a href="${s.url}">${s.title}</a>` : s.title;
        const meta = [s.skill, link].filter(Boolean).join(" ｜ ");
        html += `<small>📌 ${meta}</small><br>`;
      }
    }

    html += answer.replace(/\n/g, "<br>");
    if (i < candidates.length - 1) html += "<br><br>";
  }

  html += buildSkillMetaHtml(skillMeta);
  return html;
}

/**
 * @param {string} conversationId
 * @param {string} messageBody
 * @param {string|null} adminId
 * @param {{ replySource: string, sources: Array<{ title: string, url?: string }> }|null} skillMeta
 * @param {{ branchAxis: string, branchReason: string, candidates: Array<{...}> } | null} candidateResult
 */
export async function addNoteToConversation(conversationId, messageBody, adminId, skillMeta = null, candidateResult = null) {
  const noteBody = candidateResult?.candidates?.length > 0
    ? buildMultiCandidateNoteBody(candidateResult, skillMeta)
    : `🤖 AI回答案（参考）:<br><br>${messageBody}${buildSkillMetaHtml(skillMeta)}`;
  return icFetch(`/conversations/${conversationId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      type: "admin",
      admin_id: adminId || config.intercom.adminId,
      body: noteBody,
      message_type: "note"
    })
  });
}

export async function updateContactAttributes(contactId, customAttributes) {
  return icFetch(`/contacts/${contactId}`, {
    method: "PUT",
    body: JSON.stringify({ custom_attributes: customAttributes })
  });
}

export async function listRecentConversations(updatedSince) {
  return icFetch(`/conversations?sort=updated_at&order=desc&per_page=50&updated_since=${updatedSince}`);
}

export async function getConversationWithParts(conversationId) {
  return icFetch(`/conversations/${conversationId}`);
}
