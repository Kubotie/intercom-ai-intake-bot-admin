import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** content フィールドから Q / A を抽出する。見つからなければ title を Q に使う */
function parseQA(title: string, content: string): { question: string; answer: string } {
  const qMatch = content.match(/^Q[:：]\s*(.+?)(?=\nA[:：]|\nA\s|$)/ms);
  const aMatch = content.match(/A[:：]\s*(.+)$/ms);
  if (qMatch && aMatch) {
    return { question: qMatch[1].trim(), answer: aMatch[1].trim() };
  }
  // フォールバック: title を質問、content を回答として使用
  return { question: title, answer: content };
}

export async function POST(req: NextRequest) {
  let body: { title?: string; content?: string; question?: string; answer?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const title   = body.title   ?? "";
  const content = body.content ?? "";

  // Q/A を解析（呼び元が明示的に渡した場合はそちらを優先）
  const { question, answer } = body.question && body.answer
    ? { question: body.question, answer: body.answer }
    : parseQA(title, content);

  if (!question && !answer) {
    return NextResponse.json({ error: "question または answer が必要です" }, { status: 400 });
  }

  const databaseId = process.env.NOTION_FAQ2_DATABASE_ID;
  if (!databaseId) {
    return NextResponse.json({ error: "NOTION_FAQ2_DATABASE_ID is not set" }, { status: 503 });
  }

  // 1. Notion に FAQ ページを作成
  let notionPageId: string;
  let notionUrl: string | null = null;
  try {
    const { createFaqPage } = await import("@/lib/bot/knowledge/notion-client.js");
    const page = await createFaqPage(databaseId, { category: title || question.slice(0, 100), question, answer });
    notionPageId = page.id;
    notionUrl    = page.url;
  } catch (err: unknown) {
    return NextResponse.json({ error: `Notion 作成エラー: ${(err as Error).message}` }, { status: 500 });
  }

  // 2. NocoDB に同期
  let syncStats: Record<string, unknown> = {};
  try {
    const { syncNotionFaq2 } = await import("@/lib/bot/knowledge/sync-notion-faq2.js");
    syncStats = await syncNotionFaq2();
  } catch (err: unknown) {
    // 同期エラーは警告扱い（Notion 作成は成功しているため）
    return NextResponse.json({
      ok: true,
      notion_page_id: notionPageId,
      notion_url: notionUrl,
      sync_error: (err as Error).message,
      sync_stats: null,
    });
  }

  return NextResponse.json({
    ok: true,
    notion_page_id: notionPageId,
    notion_url: notionUrl,
    sync_stats: syncStats,
  });
}
