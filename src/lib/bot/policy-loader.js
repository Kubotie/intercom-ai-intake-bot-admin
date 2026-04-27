import path from "path";
import { listMarkdownFilesRecursive, readText } from "./file-utils.js";

const mdRoot = path.join(process.cwd(), "ai-support-bot-md");

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
 * ファイル: ai-support-bot-md/skills/<skillName>.prompt.md
 */
export function loadSkillPrompt(skillName, vars = {}) {
  const promptPath = path.join(mdRoot, "skills", `${skillName}.prompt.md`);
  let template = readText(promptPath);
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}
