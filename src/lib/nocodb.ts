const BASE = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;

const TABLES = {
  sessions:  process.env.NOCODB_SESSIONS_TABLE_ID!,
  messages:  process.env.NOCODB_MESSAGES_TABLE_ID!,
  slots:     process.env.NOCODB_SLOTS_TABLE_ID!,
  chunks:    process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID!,
  issues:    process.env.NOCODB_KNOWN_ISSUES_TABLE_ID!,
};

export type Session = {
  Id: number;
  session_uid: string;
  intercom_conversation_id: string;
  intercom_contact_id: string;
  status: string;
  category: string | null;
  selected_skill: string | null;
  reply_source: string | null;
  handoff_reason: string | null;
  escalation_reason: string | null;
  filled_slots_count: number;
  missing_slots_count: number;
  decision_trace: string | null;
  customer_intent_summary: string | null;
  recommended_next_step: string | null;
  reply_preview: string | null;
  answer_candidate_json: string | null;
  final_summary_json: string | null;
  should_escalate: boolean;
  latest_user_message: string | null;
  evaluation: string | null;
  eval_reason: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export type Message = {
  Id: number;
  session_uid: string;
  message_text: string | null;
  author_type: string;
  topic: string | null;
  message_order: number;
  intercom_message_id: string | null;
  CreatedAt: string;
};

export type KnowledgeChunk = {
  Id: number;
  chunk_id: string;
  source_type: string;
  source_name: string;
  title: string;
  body: string | null;
  tags: string | null;
  published_to_bot: boolean;
  is_active: boolean;
  url: string | null;
  updated_at: string | null;
  CreatedAt: string;
};

export type KnownIssue = {
  Id: number;
  issue_key: string;
  title: string;
  matching_keywords: string | null;
  customer_safe_message: string | null;
  status: string;
  published_to_bot: boolean;
  CreatedAt: string;
  UpdatedAt: string;
};

type ListResponse<T> = { list: T[]; pageInfo: { totalRows: number; page: number; pageSize: number; isLastPage: boolean } };

async function ncFetch<T>(tableId: string, params: Record<string, string | number> = {}): Promise<ListResponse<T>> {
  const url = new URL(`${BASE}/api/v2/tables/${tableId}/records`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { "xc-token": TOKEN },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`NocoDB ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getSessions(params: { limit?: number; offset?: number; where?: string; sort?: string } = {}): Promise<ListResponse<Session>> {
  return ncFetch<Session>(TABLES.sessions, {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    sort: params.sort ?? "-CreatedAt",
    ...(params.where ? { where: params.where } : {}),
  });
}

export async function getSession(sessionUid: string): Promise<Session | null> {
  const res = await getSessions({ where: `(session_uid,eq,${sessionUid})`, limit: 1 });
  return res.list[0] ?? null;
}

export async function getMessages(sessionUid: string): Promise<Message[]> {
  const res = await ncFetch<Message>(TABLES.messages, {
    where: `(session_uid,eq,${sessionUid})`,
    sort: "message_order",
    limit: 100,
  });
  return res.list;
}

export async function getKnowledgeChunks(params: { limit?: number; offset?: number; where?: string } = {}): Promise<ListResponse<KnowledgeChunk>> {
  return ncFetch<KnowledgeChunk>(TABLES.chunks, {
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    sort: "-CreatedAt",
    ...(params.where ? { where: params.where } : {}),
  });
}

export async function getKnownIssues(): Promise<KnownIssue[]> {
  const res = await ncFetch<KnownIssue>(TABLES.issues, { limit: 100, sort: "-CreatedAt" });
  return res.list;
}

export async function updateSessionEval(rowId: number, evaluation: string, evalReason: string): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.sessions}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId, evaluation, eval_reason: evalReason }),
  });
}

export async function getSessionStats(): Promise<{
  total: number; byCategory: Record<string, number>; byReplySource: Record<string, number>;
  byStatus: Record<string, number>; escalated: number; handedOff: number;
}> {
  const res = await getSessions({ limit: 200, sort: "-CreatedAt" });
  const sessions = res.list;
  const byCategory: Record<string, number> = {};
  const byReplySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let escalated = 0, handedOff = 0;
  for (const s of sessions) {
    if (s.category) byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    if (s.reply_source) byReplySource[s.reply_source] = (byReplySource[s.reply_source] ?? 0) + 1;
    if (s.status) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    if (s.should_escalate) escalated++;
    if (s.status === "handed_off" || s.reply_source === "handoff") handedOff++;
  }
  return { total: res.pageInfo.totalRows, byCategory, byReplySource, byStatus, escalated, handedOff };
}
