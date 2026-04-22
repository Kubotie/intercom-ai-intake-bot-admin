import fs from "fs";
import path from "path";

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function listMarkdownFilesRecursive(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listMarkdownFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results.sort();
}
