import path from "path";
import { listMarkdownFilesRecursive, readText } from "./file-utils.js";

const mdRoot = path.join(process.cwd(), "ai-support-bot-md");

// ── NocoDB prompt cache ──────────────────────────────────────────────────────
// 60秒 TTL のインメモリキャッシュ。Vercel serverless は ephemeral だが
// 同一インスタンス内でのリクエスト間コストを削減する。
const CACHE_TTL_MS = 60_000;
const promptCache = new Map(); // key → { content: string, expiresAt: number }

async function fetchPromptFromNocoDB(key) {
  const tableId = process.env.NOCODB_PROMPTS_TABLE_ID;
  const baseUrl = process.env.NOCODB_BASE_URL;
  const token   = process.env.NOCODB_API_TOKEN;
  if (!tableId || !baseUrl || !token) return null;

  try {
    const url = `${baseUrl}/api/v2/tables/${tableId}/records?where=(prompt_key,eq,${encodeURIComponent(key)})&where=(is_active,eq,true)&limit=1`;
    const res = await fetch(url, { headers: { "xc-token": token } });
    if (!res.ok) return null;
    const data = await res.json();
    const record = data?.list?.[0];
    return record?.content ?? null;
  } catch {
    return null;
  }
}

async function getCachedPrompt(key) {
  const cached = promptCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.content;

  const content = await fetchPromptFromNocoDB(key);
  if (content !== null) {
    promptCache.set(key, { content, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return content;
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

export function loadPolicyBundle() {
  const files = listMarkdownFilesRecursive(mdRoot)
    .filter((f) => !path.basename(f).endsWith(".prompt.md"));
  const chunks = files.map((f) => {
    const rel = path.relative(process.cwd(), f);
    return `\n### FILE: ${rel}\n${readText(f)}`;
  });
  return chunks.join("\n\n");
}

export function loadPrompt(relativePath) {
  return readText(path.join(mdRoot, relativePath));
}

/**
 * スキル個別の system prompt を読み込み、変数を展開して返す。
 * NocoDB の md_prompts テーブルを優先し、未登録またはエラー時はファイルにフォールバック。
 *
 * @param {string} skillName - スキル識別子 (例: "faq-answer")
 * @param {Record<string, string>} vars - 置換変数のマップ
 * @returns {Promise<string>}
 */
export async function loadSkillPrompt(skillName, vars = {}) {
  let template = await getCachedPrompt(skillName);

  if (!template) {
    // NocoDB 未登録またはエラー → ファイルにフォールバック
    const promptPath = path.join(mdRoot, "skills", `${skillName}.prompt.md`);
    template = readText(promptPath);
  }

  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value ?? "");
  }
  return template;
}

/**
 * prompts/ ディレクトリのプロンプトを NocoDB 優先で読み込む。
 * key は relativePath から拡張子と "prompts/" プレフィックスを除いた名前。
 * 例: "prompts/next_question_prompt.md" → "next_question"
 *
 * @param {string} relativePath
 * @returns {Promise<string>}
 */
export async function loadPromptAsync(relativePath) {
  const key = path.basename(relativePath, path.extname(relativePath))
    .replace(/_prompt$/, "");
  const fromDB = await getCachedPrompt(key);
  if (fromDB) return fromDB;
  return readText(path.join(mdRoot, relativePath));
}
