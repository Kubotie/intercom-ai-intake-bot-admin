import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
const LLM_API_KEY  = process.env.LLM_API_KEY  ?? "";
const LLM_MODEL    = process.env.LLM_MODEL    ?? "gpt-4.1-mini";

export type AnalysisIssue = {
  severity: "error" | "warning" | "info";
  area: "intent" | "slot" | "skill" | "handoff" | "reply" | "workflow";
  description: string;
  recommendation: string;
};

export type ConversationAnalysis = {
  outcome: "resolved" | "handoff" | "escalation" | "timeout" | "unknown";
  total_turns: number;
  score: number;
  summary: string;
  issues: AnalysisIssue[];
};

type TurnData = {
  turn: number;
  user_message: string;
  bot_reply: string | null;
  category: string;
  status: string;
  slots_filled: number;
  slots_total: number;
  reply_source: string;
  should_escalate: boolean;
  decision_trace: string;
};

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const turns         = Array.isArray(body.turns) ? (body.turns as TurnData[]) : [];
  const scenarioContext = typeof body.scenario_context === "string" ? body.scenario_context : "";
  const outcome       = typeof body.outcome === "string" ? body.outcome : "unknown";

  if (turns.length === 0) {
    return NextResponse.json({ error: "turns is required" }, { status: 400 });
  }

  const turnsText = turns.map((t) =>
    `[Turn ${t.turn}]
ユーザー: ${t.user_message}
Bot: ${t.bot_reply ?? "（返信なし）"}
--- 内部状態 ---
category: ${t.category} / status: ${t.status}
slots: ${t.slots_filled}/${t.slots_total} 収集済み
reply_source: ${t.reply_source}
decision_trace: ${t.decision_trace}`
  ).join("\n\n");

  const prompt = `あなたはPtengineのAIサポートbot品質レビュアーです。
以下のbotシミュレーション会話を分析し、問題点と改善提案をJSON形式で返してください。

【ユーザーの状況・背景】
${scenarioContext || "（特になし）"}

【会話ログ（内部状態付き）】
${turnsText}

【会話の結果】
${outcome}（全${turns.length}ターン）

以下のJSON形式のみで回答してください（マークダウン不要）:
{
  "score": 0〜100の整数（会話品質スコア。handoffで適切に終わったら70〜90、解決なら80〜100、ループ/混乱なら低め）,
  "summary": "会話全体の評価を2〜3文で",
  "issues": [
    {
      "severity": "error"|"warning"|"info",
      "area": "intent"|"slot"|"skill"|"handoff"|"reply"|"workflow",
      "description": "問題の説明（具体的に）",
      "recommendation": "改善策（workflow設定・knowledge追加・スロット定義変更など具体的に）"
    }
  ]
}

分析観点:
- intentの分類は正しかったか
- 必要なスロットを効率よく収集できたか（重複質問・抜け漏れ）
- skillがあれば有用な回答を返せたか
- handoff/escalationのタイミングは適切だったか
- botの返答は自然で親切だったか
- workflowやknowledge baseに何か追加・変更すべきか`;

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.3,
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const raw  = data.choices?.[0]?.message?.content?.trim() ?? "{}";

    let analysis: ConversationAnalysis;
    try {
      const parsed = JSON.parse(raw);
      analysis = {
        outcome: outcome as ConversationAnalysis["outcome"],
        total_turns: turns.length,
        score:   typeof parsed.score   === "number" ? parsed.score   : 50,
        summary: typeof parsed.summary === "string"  ? parsed.summary : "",
        issues:  Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      analysis = {
        outcome: outcome as ConversationAnalysis["outcome"],
        total_turns: turns.length,
        score: 50,
        summary: raw.slice(0, 300),
        issues: [],
      };
    }

    return NextResponse.json(analysis);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message ?? "LLM call failed" }, { status: 500 });
  }
}
