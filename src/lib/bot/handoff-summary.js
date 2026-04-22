// ─────────────────────────────────────────────
// Handoff Summary モジュール
//
// 担当者向け引き継ぎサマリーを生成する。
//
// 生成タイミング:
//   - reply_source=handoff (status=ready_for_handoff)
//   - reply_source=escalation (should_escalate=true)
//
// LLM あり: LLM で自然文を生成。失敗時はテンプレートにフォールバック。
// LLM なし: テンプレートベースで生成。bot 全体は落とさない。
// ─────────────────────────────────────────────

import { config } from "./config.js";
import { logger } from "./logger.js";

export const SUMMARY_VERSION = "1.0";

// category → 顧客意図の日本語ラベル
const CATEGORY_INTENT_LABEL = {
  tracking_issue:    "計測・トラッキングの不具合確認",
  report_difference: "レポート数値の差異確認",
  login_account:     "ログイン・アカウント問題の解決",
  billing_contract:  "請求・契約内容の確認",
  bug_report:        "機能不具合の報告・確認",
  usage_guidance:    "機能の使い方・操作案内"
};

// slot 名 → 日本語ラベル
const SLOT_LABELS = {
  project_name_or_id:    "プロジェクト名またはID",
  target_url:            "対象URL",
  symptom:               "症状",
  occurred_at:           "発生日時",
  recent_change:         "最近の変更",
  report_name:           "レポート名",
  date_range:            "対象期間",
  compare_target:        "比較対象",
  expected_value:        "期待値",
  actual_value:          "実際の値",
  account_email_or_user: "メールアドレスまたはユーザー名",
  occurred_screen:       "発生した画面",
  error_message:         "エラーメッセージ",
  contract_target:       "契約対象",
  inquiry_topic:         "お問い合わせ内容",
  target_period:         "対象期間",
  reproduction_steps:    "再現手順",
  target_feature:        "対象機能",
  user_goal:             "やりたいこと"
};

function isFilledSlot(slot) {
  return (
    slot.is_collected &&
    slot.slot_value !== null &&
    slot.slot_value !== undefined &&
    String(slot.slot_value).trim() !== ""
  );
}

/**
 * テンプレートベースの handoff summary 生成 (同期・fallback)。
 *
 * @param {{ category: string, slots: Array, shouldEscalate: boolean, replySource: string }} opts
 * @returns {{ handoff_summary: string, summary_version: string, summary_for_agent: object }}
 */
export function buildTemplateHandoffSummary({ category, slots, shouldEscalate, replySource }) {
  const intent = CATEGORY_INTENT_LABEL[category] || category;
  const filled = slots.filter(isFilledSlot);
  const missing = slots.filter((s) => s.is_required && !isFilledSlot(s));

  const confirmedFacts = filled.map((s) => {
    const label = SLOT_LABELS[s.slot_name] || s.slot_name;
    return `${label}: ${String(s.slot_value).trim()}`;
  });

  const missingInfo = missing.map((s) => SLOT_LABELS[s.slot_name] || s.slot_name);

  const parts = [];
  if (shouldEscalate) parts.push("【緊急】");
  parts.push(`顧客は「${intent}」について問い合わせています。`);
  if (confirmedFacts.length > 0) {
    parts.push(`確認済み: ${confirmedFacts.join("、")}。`);
  }
  if (missingInfo.length > 0) {
    parts.push(`未確認: ${missingInfo.join("、")}。担当者確認が必要です。`);
  }

  const nextStep = shouldEscalate
    ? "緊急対応を優先してください"
    : missingInfo.length > 0
      ? `${missingInfo.slice(0, 2).join("、")} など未確認情報を確認してください`
      : "収集済み情報をもとに対応を進めてください";

  return {
    handoff_summary: parts.join(""),
    summary_version: SUMMARY_VERSION,
    summary_for_agent: {
      customer_intent: intent,
      confirmed_facts: confirmedFacts,
      missing_information: missingInfo,
      recommended_next_step: nextStep
    }
  };
}

async function buildLlmHandoffSummary({ category, slots, latestUserMessage, shouldEscalate }) {
  const intent = CATEGORY_INTENT_LABEL[category] || category;
  const filled = slots.filter(isFilledSlot);
  const missing = slots.filter((s) => s.is_required && !isFilledSlot(s));

  const collectedSlots = Object.fromEntries(
    filled.map((s) => [SLOT_LABELS[s.slot_name] || s.slot_name, String(s.slot_value).trim()])
  );
  const missingSlots = missing.map((s) => SLOT_LABELS[s.slot_name] || s.slot_name);

  const systemPrompt = `あなたはカスタマーサポートの担当者向けに引き継ぎサマリーを作成するAIです。
収集済み情報をもとに、担当者がすぐ対応できるよう簡潔で明確なサマリーを生成してください。

ルール:
- 推測せず収集済み情報のみを整理する
- handoff_summary は100〜150文字以内
- summary_for_agent は構造化する
- JSONのみ出力する

出力形式:
{
  "handoff_summary": "担当者向け1〜2文の要約",
  "summary_for_agent": {
    "customer_intent": "顧客が求めていること",
    "confirmed_facts": ["確認済み情報1", "確認済み情報2"],
    "missing_information": ["未確認項目1", "未確認項目2"],
    "recommended_next_step": "担当者が次に確認・対応すべきこと"
  }
}`;

  const userContent = JSON.stringify({
    category: intent,
    latest_user_message: latestUserMessage?.slice(0, 200) ?? null,
    collected_slots: collectedSlots,
    missing_slots: missingSlots,
    is_escalation: shouldEscalate
  }, null, 2);

  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`LLM error: ${JSON.stringify(data)}`);

  const content = data?.choices?.[0]?.message?.content;
  const trimmed = String(content || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error(`LLM non-JSON response: ${trimmed.slice(0, 200)}`);
  }
}

/**
 * 担当者向け handoff summary を生成する。
 * LLM を試みて失敗した場合はテンプレートにフォールバック。
 * 例外を外に出さず bot 全体を落とさない。
 *
 * @param {{ category: string, slots: Array, latestUserMessage: string, shouldEscalate: boolean, replySource: string, ctx: object }} opts
 * @returns {Promise<{ handoff_summary: string, summary_version: string, summary_for_agent: object }>}
 */
export async function buildHandoffSummary({ category, slots, latestUserMessage, shouldEscalate, replySource, ctx }) {
  logger.info("handoff summary generation started", {
    category,
    reply_source: replySource,
    should_escalate: shouldEscalate,
    slot_count: slots?.length ?? 0,
    ...ctx
  });

  if (config.llm.apiKey) {
    try {
      const llmResult = await buildLlmHandoffSummary({ category, slots, latestUserMessage, shouldEscalate });
      if (llmResult?.handoff_summary && llmResult?.summary_for_agent) {
        const result = {
          handoff_summary: llmResult.handoff_summary,
          summary_version: SUMMARY_VERSION,
          summary_for_agent: llmResult.summary_for_agent
        };
        logger.info("handoff summary generated", {
          category,
          reply_source: replySource,
          summary_version: SUMMARY_VERSION,
          ...ctx
        });
        return result;
      }
    } catch (err) {
      logger.warn("handoff summary LLM failed, falling back to template", {
        category,
        error: err?.message,
        ...ctx
      });
    }
  }

  const result = buildTemplateHandoffSummary({ category, slots, shouldEscalate, replySource });
  logger.info("handoff summary fallback used", {
    category,
    reply_source: replySource,
    ...ctx
  });
  return result;
}
