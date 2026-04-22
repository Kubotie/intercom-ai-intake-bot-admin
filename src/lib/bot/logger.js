import fs from "fs";
import path from "path";
import { config } from "./config.js";

// ファイルログは書き込み可能なときだけ有効にする。
// Vercel の serverless 環境はファイルシステムが読み取り専用のため、
// ファイル書き込みは失敗してもクラッシュさせない。
let _logDirOk = null;

function canWriteLogs() {
  if (_logDirOk !== null) return _logDirOk;
  try {
    fs.mkdirSync(config.logDir, { recursive: true });
    _logDirOk = true;
  } catch {
    _logDirOk = false;
  }
  return _logDirOk;
}

function tryAppend(filePath, content) {
  if (!canWriteLogs()) return;
  try {
    fs.appendFileSync(filePath, content);
  } catch {
    // 書き込み失敗は無視 (Vercel 等の read-only 環境)
  }
}

export function ensureLogDir() {
  canWriteLogs();
}

/**
 * raw payload を記録する。
 * ctx を渡すと "topic=... conv=... msg=..." のヘッダー行が先頭に付き、
 * Vercel Logs / ローカルログで grep しやすくなる。
 *
 * @param {object} payload
 * @param {{ topic?: string, conversation_id?: string|null, message_id?: string|null }} ctx
 */
export function logRawPayload(payload, ctx = {}) {
  const topic = ctx.topic ?? "?";
  const conv  = ctx.conversation_id ?? "?";
  const msg   = ctx.message_id ?? "?";

  // ヘッダー行: Vercel Logs で "conv=<id>" 等で検索できる
  const header = `[raw-payload] topic=${topic} conv=${conv} msg=${msg}`;
  console.log(header);
  console.log(JSON.stringify(payload));

  // ローカル開発時だけファイルに保存
  tryAppend(
    path.join(config.logDir, "intercom_webhooks.log"),
    `${header}\n${JSON.stringify(payload, null, 2)}\n\n`
  );
}

function write(level, message, meta = {}) {
  const entry = { ts: new Date().toISOString(), level, message, ...meta };
  const line = JSON.stringify(entry);

  // console は常に出力 (Vercel Logs に流れる)
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }

  // ローカル開発時だけファイルに保存
  tryAppend(path.join(config.logDir, "app.log"), line + "\n");
}

export const logger = {
  info(message, meta) { write("info", message, meta); },
  warn(message, meta) { write("warn", message, meta); },
  error(message, meta) { write("error", message, meta); }
};
