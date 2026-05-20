import { config } from "./config.js";
import { loadPolicyBundle, loadPrompt } from "./policy-loader.js";

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error(`LLM returned non-JSON content: ${trimmed.slice(0, 400)}`);
}

async function chat(messages) {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.llm.apiKey}`
    },
    body: JSON.stringify({
      model: config.llm.model,
      temperature: config.llm.temperature,
      response_format: { type: "json_object" },
      messages
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`LLM request failed: ${JSON.stringify(data)}`);
  const content = data?.choices?.[0]?.message?.content;
  return extractJson(content);
}

export async function classifyCategory({ latestUserMessage, categoryCandidates, categoryDefinitions }) {
  const policyBundle = loadPolicyBundle();
  const prompt = loadPrompt("prompts/classifier_prompt.md");
  const userPayload = { latest_user_message: latestUserMessage, category_candidates: categoryCandidates };
  if (categoryDefinitions) userPayload.category_definitions = categoryDefinitions;
  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(userPayload, null, 2) }
  ]);
}

export async function generateNextQuestion({ category, nlInstruction, globalPolicyInstruction, requiredSlots, collectedSlots, askSlots, latestUserMessage, conversationHistorySummary, escalationSignals, customerName, isFirstContact, imageDescriptions, urlContext, allowImageMarkdown }) {
  const policyBundle = loadPolicyBundle();
  const prompt = loadPrompt("prompts/next_question_prompt.md");
  const payload = {
    category,
    nl_instruction: nlInstruction ?? null,
    global_policy_instruction: globalPolicyInstruction ?? null,
    required_slots: requiredSlots,
    collected_slots: collectedSlots,
    ask_slots: askSlots,
    latest_user_message: latestUserMessage,
    customer_name: customerName || null,
    is_first_contact: isFirstContact || false,
    conversation_history_summary: conversationHistorySummary,
    escalation_signals: escalationSignals,
  };
  if (imageDescriptions) payload.image_descriptions = imageDescriptions;
  if (urlContext && urlContext.length > 0) payload.url_context = urlContext;
  if (allowImageMarkdown) payload.allow_image_markdown = true;
  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(payload, null, 2) }
  ]);
}

export async function extractSlots({ category, requiredSlots, latestUserMessage }) {
  const prompt = loadPrompt("prompts/slot_extractor_prompt.md");
  return chat([
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({
      category,
      required_slots: requiredSlots,
      latest_user_message: latestUserMessage
    }, null, 2) }
  ]);
}

export async function evaluateHandoffReadinessNL({ category, nlInstruction, collectedSlots, latestUserMessage }) {
  const prompt = loadPrompt("prompts/handoff_eval_prompt.md");
  return chat([
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({
      category,
      nl_instruction: nlInstruction,
      collected_slots: collectedSlots,
      latest_user_message: latestUserMessage
    }, null, 2) }
  ]);
}

export async function summarizeForAgent(input) {
  const policyBundle = loadPolicyBundle();
  const prompt = loadPrompt("prompts/summarizer_prompt.md");
  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input, null, 2) }
  ]);
}
