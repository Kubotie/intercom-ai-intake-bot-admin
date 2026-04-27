const BASE = process.env.NOCODB_BASE_URL!;
const TOKEN = process.env.NOCODB_API_TOKEN!;

const TABLES = {
  sessions:         process.env.NOCODB_SESSIONS_TABLE_ID!,
  messages:         process.env.NOCODB_MESSAGES_TABLE_ID!,
  slots:            process.env.NOCODB_SLOTS_TABLE_ID!,
  chunks:           process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID!,
  issues:           process.env.NOCODB_KNOWN_ISSUES_TABLE_ID!,
  knowledgeSources: process.env.NOCODB_KNOWLEDGE_SOURCES_TABLE_ID ?? "",
  concierges:       process.env.NOCODB_CONCIERGES_TABLE_ID ?? "",
  testTargets:      process.env.NOCODB_TEST_TARGETS_TABLE_ID ?? "",
  rolloutRules:     process.env.NOCODB_ROLLOUT_RULES_ID ?? "",
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
  concierge_key: string | null;
  concierge_name: string | null;
  target_match_reason: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export type Message = {
  Id: number;
  session_uid: string;
  message_text: string | null;
  role: string;
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

export type Concierge = {
  Id: number;
  concierge_key: string;
  display_name: string;
  description: string | null;
  intercom_admin_id: string | null;
  persona_label: string | null;
  policy_set_key: string | null;
  skill_profile_key: string | null;
  source_priority_profile_key: string | null;
  is_active: boolean;
  is_main: boolean;
  is_test_only: boolean;
  notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export type TestTarget = {
  Id: number;
  target_type: string;
  target_value: string;
  label: string | null;
  environment: string | null;
  concierge_key: string | null;
  is_active: boolean;
  notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export type KnowledgeSource = {
  Id: number;
  source_key: string | null;
  source_name: string;
  source_type: string;
  description: string | null;
  source_url_or_path: string | null;
  is_active: boolean;
  sync_enabled: boolean;
  freshness_status: string | null;
  last_synced_at: string | null;
  chunk_count: number | null;
  published_chunk_count: number | null;
  notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export type RolloutRule = {
  Id: number;
  rule_name: string;
  priority: number;
  environment: string | null;
  condition_json: string | null;
  assigned_concierge_key: string | null;
  mode: string;
  is_active: boolean;
  notes: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export async function getConcierges(): Promise<Concierge[]> {
  if (!TABLES.concierges) return [];
  const res = await ncFetch<Concierge>(TABLES.concierges, { limit: 100, sort: "-is_main" });
  return res.list;
}

export async function createConcierge(data: Partial<Concierge>): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.concierges}/records`, {
    method: "POST",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateConcierge(rowId: number, data: Partial<Concierge>): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.concierges}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId, ...data }),
  });
}

export async function deleteConcierge(rowId: number): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.concierges}/records`, {
    method: "DELETE",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId }),
  });
}

export async function getTestTargets(): Promise<ListResponse<TestTarget>> {
  if (!TABLES.testTargets) return { list: [], pageInfo: { totalRows: 0, page: 1, pageSize: 100, isLastPage: true } };
  return ncFetch<TestTarget>(TABLES.testTargets, { limit: 100, sort: "-CreatedAt" });
}

export async function createTestTarget(data: Partial<TestTarget>): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.testTargets}/records`, {
    method: "POST",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTestTarget(rowId: number, data: Partial<TestTarget>): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.testTargets}/records`, {
    method: "PATCH",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId, ...data }),
  });
}

export async function deleteTestTarget(rowId: number): Promise<void> {
  await fetch(`${BASE}/api/v2/tables/${TABLES.testTargets}/records`, {
    method: "DELETE",
    headers: { "xc-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: rowId }),
  });
}

export async function getKnowledgeSources(): Promise<KnowledgeSource[]> {
  if (!TABLES.knowledgeSources) return [];
  const res = await ncFetch<KnowledgeSource>(TABLES.knowledgeSources, { limit: 50, sort: "-last_synced_at" });
  return res.list;
}

export async function getRolloutRules(): Promise<RolloutRule[]> {
  if (!TABLES.rolloutRules) return [];
  const res = await ncFetch<RolloutRule>(TABLES.rolloutRules, { limit: 100, sort: "priority" });
  return res.list;
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

function toJSTDateStr(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isSkillAccepted(replySource: string | null): boolean {
  return replySource === "faq_answer" || replySource === "help_center_answer" || replySource === "known_bug_match";
}

export type TodayStats = {
  replies: number;
  handoffs: number;
  escalations: number;
  skillAccepted: number;
  skillRejected: number;
};

export async function getSessionStatsToday(): Promise<TodayStats> {
  const todayJST = toJSTDateStr(new Date());
  const todayStartUTC = new Date(`${todayJST}T00:00:00+09:00`).toISOString();
  const res = await getSessions({ limit: 200, where: `(CreatedAt,gte,${todayStartUTC})`, sort: "-CreatedAt" });
  let replies = 0, handoffs = 0, escalations = 0, skillAccepted = 0, skillRejected = 0;
  for (const s of res.list) {
    if (toJSTDateStr(new Date(s.CreatedAt)) !== todayJST) continue;
    replies++;
    if (s.should_escalate) escalations++;
    if (s.status === "handed_off" || s.reply_source === "handoff") handoffs++;
    if (isSkillAccepted(s.reply_source)) skillAccepted++;
    else if (s.selected_skill) skillRejected++;
  }
  return { replies, handoffs, escalations, skillAccepted, skillRejected };
}

export type DailyStat = {
  date: string;
  replies: number;
  handoffs: number;
  escalations: number;
  skillAccepted: number;
};

export async function getDailyStats(days: number = 7): Promise<DailyStat[]> {
  const now = new Date();
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(toJSTDateStr(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  const startUTC = new Date(`${dates[0]}T00:00:00+09:00`).toISOString();
  const res = await getSessions({ limit: 500, where: `(CreatedAt,gte,${startUTC})`, sort: "CreatedAt" });
  const statsMap: Record<string, DailyStat> = {};
  for (const d of dates) statsMap[d] = { date: d, replies: 0, handoffs: 0, escalations: 0, skillAccepted: 0 };
  for (const s of res.list) {
    const d = toJSTDateStr(new Date(s.CreatedAt));
    if (!statsMap[d]) continue;
    statsMap[d].replies++;
    if (s.should_escalate) statsMap[d].escalations++;
    if (s.status === "handed_off" || s.reply_source === "handoff") statsMap[d].handoffs++;
    if (isSkillAccepted(s.reply_source)) statsMap[d].skillAccepted++;
  }
  return dates.map(d => statsMap[d]);
}
