function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parseIds(envValue) {
  if (!envValue) return [];
  return envValue.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || "development",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3001",
  enableIntercomReply: process.env.ENABLE_INTERCOM_REPLY === "true",
  intercom: {
    accessToken: required("INTERCOM_ACCESS_TOKEN"),
    adminId: process.env.INTERCOM_ADMIN_ID || "",
    apiBaseUrl: process.env.INTERCOM_API_BASE_URL || "https://api.intercom.io",
    testContactIds: parseIds(process.env.INTERCOM_TEST_CONTACT_IDS),
    testConversationIds: parseIds(process.env.INTERCOM_TEST_CONVERSATION_IDS)
  },
  nocodb: {
    baseUrl: required("NOCODB_BASE_URL").replace(/\/$/, ""),
    apiToken: required("NOCODB_API_TOKEN"),
    apiPath: process.env.NOCODB_API_PATH || "/api/v2",
    tables: {
      sessions: required("NOCODB_SESSIONS_TABLE_ID"),
      slots: process.env.NOCODB_SLOTS_TABLE_ID || "",
      messages: required("NOCODB_MESSAGES_TABLE_ID"),
      knowledgeSources: process.env.NOCODB_KNOWLEDGE_SOURCES_TABLE_ID || "",
      knowledgeChunks: process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID || "",
      knownIssues: process.env.NOCODB_KNOWN_ISSUES_TABLE_ID || "",
      cseCases: process.env.NOCODB_CSE_CASES_TABLE_ID || "",
      testTargets: process.env.NOCODB_TEST_TARGETS_TABLE_ID || "",
      concierges: process.env.NOCODB_CONCIERGES_TABLE_ID || "",
      skills: process.env.NOCODB_SKILLS_TABLE_ID || ""
    }
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || "",
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "gpt-4.1-mini",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2)
  },
  logDir: process.env.LOG_DIR || "./logs"
};
