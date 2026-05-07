import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const LLM_BASE_URL  = process.env.LLM_BASE_URL  ?? "https://api.openai.com/v1";
const LLM_API_KEY   = process.env.LLM_API_KEY   ?? "";
const LLM_MODEL     = process.env.LLM_MODEL     ?? "gpt-4.1-mini";

type TurnHistory = { role: "user" | "bot"; message: string };

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const botReply      = typeof body.bot_reply      === "string" ? body.bot_reply      : "";
  const scenarioContext = typeof body.scenario_context === "string" ? body.scenario_context : "";
  const category      = typeof body.category       === "string" ? body.category       : "";
  const status        = typeof body.status         === "string" ? body.status         : "collecting";
  const history       = Array.isArray(body.history) ? (body.history as TurnHistory[]) : [];

  if (!botReply) {
    return NextResponse.json({ error: "bot_reply is required" }, { status: 400 });
  }

  const historyText = history.map((h, i) =>
    `[Turn ${i + 1}]\n${h.role === "user" ? "ユーザー" : "Bot"}: ${h.message}`
  ).join("\n");

  const prompt = `あなたはPtengineのサポートに問い合わせているユーザーをシミュレートするAIです。
以下の状況を踏まえ、Botの最新返答を受けてユーザーが次に送るメッセージを生成してください。

【ユーザーの状況・背景】
${scenarioContext || "（特になし）"}

【分類されたカテゴリ】
${category || "不明"}

【これまでの会話履歴】
${historyText || "（初回）"}

【Botの最新返答】
${botReply}

【ルール】
- 日本語で、実際のユーザーらしい自然な口調で書く
- Botが質問したことに答える（手元の情報から推測して具体的に答える）
- Botの回答で問題が解決した場合は「ありがとうございます、解決しました」などで締める
- Botが担当者に引き継ぐと言った場合は「よろしくお願いします」などで応じる
- 1〜3文程度で簡潔に
- ユーザーの状況に沿った自然な情報を提供する（体験名・URL等は状況から推測して作ってよい）

次のユーザーメッセージのみを出力してください（説明や前置き不要）:`;

  try {
    const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.7,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `LLM error: ${err.slice(0, 200)}` }, { status: 502 });
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    const nextMessage = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ next_user_message: nextMessage, status });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message ?? "LLM call failed" }, { status: 500 });
  }
}
