import { config } from "./config.js";
import { loadPolicyBundle, loadPromptAsync } from "./policy-loader.js";

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

/**
 * categoryCandidates: string[] | { key: string, label: string, description?: string }[]
 * 後者の場合、label/description をプロンプトに追記してカスタムカテゴリの識別精度を上げる。
 */
export async function classifyCategory({ latestUserMessage, categoryCandidates }) {
  const policyBundle = loadPolicyBundle();
  const prompt = await loadPromptAsync("prompts/classifier_prompt.md");

  // 文字列配列と {key,label,description} 配列の両方に対応
  const isEnriched = categoryCandidates.length > 0 && typeof categoryCandidates[0] === "object";
  const candidateKeys = isEnriched ? categoryCandidates.map(c => c.key) : categoryCandidates;

  // カスタムカテゴリの定義をプロンプトに動的追記
  let customSection = "";
  if (isEnriched) {
    const customDefs = categoryCandidates
      .filter(c => c.description || c.label !== c.key)
      .map(c => `- **${c.key}** (${c.label})${c.description ? `: ${c.description}` : ""}`)
      .join("\n");
    if (customDefs) {
      customSection = `\n\n## ワークフロー追加カテゴリ（上記と同等に使用可能）\n\n${customDefs}`;
    }
  }

  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt + customSection },
    { role: "user", content: JSON.stringify({ latest_user_message: latestUserMessage, category_candidates: candidateKeys }, null, 2) }
  ]);
}

export async function generateNextQuestion({ category, requiredSlots, collectedSlots, askSlots, latestUserMessage, conversationHistorySummary, escalationSignals, customerName, isFirstContact }) {
  const policyBundle = loadPolicyBundle();
  const prompt = await loadPromptAsync("prompts/next_question_prompt.md");
  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({
      category,
      required_slots: requiredSlots,
      collected_slots: collectedSlots,
      ask_slots: askSlots,
      latest_user_message: latestUserMessage,
      conversation_history_summary: conversationHistorySummary,
      escalation_signals: escalationSignals,
      customer_name: customerName || null,
      is_first_contact: isFirstContact || false
    }, null, 2) }
  ]);
}

export async function extractSlots({ category, requiredSlots, latestUserMessage }) {
  const prompt = await loadPromptAsync("prompts/slot_extractor_prompt.md");
  return chat([
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({
      category,
      required_slots: requiredSlots,
      latest_user_message: latestUserMessage
    }, null, 2) }
  ]);
}

export async function summarizeForAgent(input) {
  const policyBundle = loadPolicyBundle();
  const prompt = await loadPromptAsync("prompts/summarizer_prompt.md");
  return chat([
    { role: "system", content: policyBundle },
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(input, null, 2) }
  ]);
}
