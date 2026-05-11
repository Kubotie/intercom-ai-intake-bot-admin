import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const LLM_API_KEY  = process.env.LLM_API_KEY  ?? "";
const LLM_MODEL    = process.env.LLM_MODEL    ?? "gpt-4.1-mini";

export type ImprovementActionItem = {
  type: "add_faq" | "update_knowledge" | "adjust_workflow" | "add_skill" | "other";
  priority: "high" | "medium" | "low";
  title: string;
  content: string;
  target: string;
};

export type ImprovementSuggestion = {
  problem: string;
  root_cause: string;
  actions: ImprovementActionItem[];
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const userMessage     = typeof body.user_message     === "string" ? body.user_message     : "";
  const botReply        = typeof body.bot_reply        === "string" ? body.bot_reply        : "";
  const expectedReply   = typeof body.expected_reply   === "string" ? body.expected_reply   : "";
  const category        = typeof body.category         === "string" ? body.category         : "";
  const decisionTrace   = typeof body.decision_trace   === "string" ? body.decision_trace   : "";
  const replySource     = typeof body.reply_source     === "string" ? body.reply_source     : "";
  const scenarioContext = typeof body.scenario_context === "string" ? body.scenario_context : "";

  if (!userMessage || !botReply || !expectedReply) {
    return NextResponse.json({ error: "user_message, bot_reply, expected_reply are required" }, { status: 400 });
  }

  const prompt = `あなたはPtengineのAIサポートbot改善コンサルタントです。
botが誤った・不十分な回答をした原因を分析し、具体的な改善アクションをJSON形式で返してください。

【ユーザーの質問】
${userMessage}

【botの実際の回答】
${botReply}

【正しい期待する回答】
${expectedReply}

【内部情報】
- カテゴリ: ${category}
- reply_source: ${replySource}
- decision_trace: ${decisionTrace}
- ユーザー状況: ${scenarioContext || "（特になし）"}

以下のJSON形式のみで回答してください（マークダウン不要）:
{
  "problem": "何が問題だったか（1〜2文、具体的に）",
  "root_cause": "wrong_knowledge|missing_faq|wrong_category|workflow_issue|skill_gap のいずれか",
  "actions": [
    {
      "type": "add_faq"|"update_knowledge"|"adjust_workflow"|"add_skill"|"other",
      "priority": "high"|"medium"|"low",
      "title": "アクションのタイトル（短く）",
      "content": "具体的に追加・変更すべきテキスト（FAQなら「Q: xxx\\nA: yyy」形式。ナレッジなら追記テキスト。そのままコピペして使えるレベルで）",
      "target": "反映先（例: NocoDB FAQ skill テーブル / ai-support-bot-md/knowledge/billing.md / processor.js の escalation条件 など）"
    }
  ]
}

分析観点:
- reply_sourceが何か（faq_answer/help_center_answer/next_message/escalation）→ どこから回答しているか
- faq_answerなら: FAQの内容が誤っているか、あるいは別のFAQが優先されたか
- next_messageなら: FAQスキルがなく案内文のみ→FAQエントリ追加が必要
- 期待回答の内容をそのままFAQエントリ化する提案を最優先で出す
- 複数のアクションが必要な場合は全て列挙する（最大3件）`;

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.2,
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw  = data.choices?.[0]?.message?.content?.trim() ?? "{}";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let suggestion: ImprovementSuggestion;
    try {
      const parsed = JSON.parse(cleaned);
      suggestion = {
        problem:    typeof parsed.problem    === "string" ? parsed.problem    : "分析失敗",
        root_cause: typeof parsed.root_cause === "string" ? parsed.root_cause : "unknown",
        actions:    Array.isArray(parsed.actions) ? parsed.actions : [],
      };
    } catch {
      suggestion = { problem: raw.slice(0, 200), root_cause: "unknown", actions: [] };
    }

    return NextResponse.json(suggestion);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message ?? "LLM call failed" }, { status: 500 });
  }
}
