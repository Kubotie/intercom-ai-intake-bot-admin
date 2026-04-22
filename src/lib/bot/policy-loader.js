import path from "path";
import { listMarkdownFilesRecursive, readText } from "./file-utils.js";

const mdRoot = path.join(process.cwd(), "ai-support-bot-md");

export function loadPolicyBundle() {
  const files = listMarkdownFilesRecursive(mdRoot);
  const chunks = files.map((f) => {
    const rel = path.relative(process.cwd(), f);
    return `\n### FILE: ${rel}\n${readText(f)}`;
  });
  return chunks.join("\n\n");
}

export function loadPrompt(relativePath) {
  return readText(path.join(mdRoot, relativePath));
}
