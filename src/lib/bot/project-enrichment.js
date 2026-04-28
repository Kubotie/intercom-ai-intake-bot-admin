// ─────────────────────────────────────────────
// project-enrichment.js
//
// Intercom 会話の source.url から Ptengine project_id を抽出し、
// Metabase CSV を参照して Intercom コンタクトのカスタム属性を更新する。
//
// 環境変数:
//   PTENGINE_PROJECT_CSV_URL   — Metabase CSV の URL (必須)
//   PTENGINE_PROJECT_URL_REGEX — project_id 抽出の正規表現 (省略時: /\/app\/([a-zA-Z0-9]+)\//)
// ─────────────────────────────────────────────

import { logger } from "./logger.js";
import { updateContactAttributes } from "./intercom-api.js";

const PROJECT_URL_REGEX = process.env.PTENGINE_PROJECT_URL_REGEX
  ? new RegExp(process.env.PTENGINE_PROJECT_URL_REGEX)
  : /\/app\/([a-zA-Z0-9]+)\//;

const CSV_TTL_MS = 60 * 60 * 1000; // 1時間キャッシュ

/** @type {Map<string, { paid_status: string, domain: string }> | null} */
let csvCache = null;
let csvCachedAt = 0;

// ── CSV パース (RFC 4180 準拠の簡易版) ──────────
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let val = "";
      i++; // opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ",") i++;
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

function buildProjectMap(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return new Map();

  const headers = parseCsvLine(lines[0]).map(h => h.trim());

  // 列インデックスを柔軟に探す (大文字小文字・スペース違い吸収)
  function findCol(...candidates) {
    for (const c of candidates) {
      const idx = headers.findIndex(h => h.toLowerCase() === c.toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  }

  const idxProjectId  = findCol("project_id", "Project ID", "ProjectID", "id", "ID");
  const idxPaidStatus = findCol("Paid Status", "paid_status", "PaidStatus", "plan", "Plan", "Package");
  const idxDomain     = findCol("Domain", "domain", "Project Domain", "project_domain");

  if (idxProjectId === -1) {
    logger.warn("project-enrichment: project_id column not found in CSV", { headers });
    return new Map();
  }

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const projectId = vals[idxProjectId]?.trim();
    if (!projectId) continue;
    map.set(projectId, {
      paid_status: idxPaidStatus !== -1 ? (vals[idxPaidStatus]?.trim() ?? "") : "",
      domain:      idxDomain     !== -1 ? (vals[idxDomain]?.trim()     ?? "") : ""
    });
  }

  logger.info("project-enrichment: CSV loaded", { row_count: map.size });
  return map;
}

async function getProjectMap() {
  const csvUrl = process.env.PTENGINE_PROJECT_CSV_URL;
  if (!csvUrl) return null;

  const now = Date.now();
  if (csvCache && now - csvCachedAt < CSV_TTL_MS) return csvCache;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      logger.warn("project-enrichment: CSV fetch failed", { status: res.status, url: csvUrl });
      return csvCache; // 古いキャッシュを返す (フェイルセーフ)
    }
    const text = await res.text();
    csvCache = buildProjectMap(text);
    csvCachedAt = now;
    return csvCache;
  } catch (err) {
    logger.warn("project-enrichment: CSV fetch error", { error: err.message });
    return csvCache;
  }
}

// ── 公開 API ─────────────────────────────────

export function extractProjectId(url) {
  if (!url) return null;
  const m = url.match(PROJECT_URL_REGEX);
  return m ? m[1] : null;
}

/**
 * contactId と page URL を受け取り、Intercom コンタクトを enrichment する。
 * エラーは throw せず logger.warn で記録して終了する。
 */
export async function enrichContactFromUrl(contactId, pageUrl) {
  if (!contactId || !pageUrl) return;

  const csvUrl = process.env.PTENGINE_PROJECT_CSV_URL;
  if (!csvUrl) {
    logger.warn("project-enrichment: PTENGINE_PROJECT_CSV_URL not set, skipping", { contactId });
    return;
  }

  const projectId = extractProjectId(pageUrl);
  if (!projectId) {
    logger.info("project-enrichment: project_id not found in URL", { contactId, pageUrl });
    return;
  }

  const map = await getProjectMap();
  if (!map) return;

  const info = map.get(projectId);
  if (!info) {
    logger.info("project-enrichment: project_id not found in CSV", { contactId, projectId });
    return;
  }

  const attrs = {};
  if (info.paid_status) attrs.Session_Package_type = info.paid_status;
  if (info.domain)      attrs.Session_Project_domain = info.domain;

  if (Object.keys(attrs).length === 0) {
    logger.info("project-enrichment: no attributes to update", { contactId, projectId });
    return;
  }

  try {
    await updateContactAttributes(contactId, attrs);
    logger.info("project-enrichment: contact updated", {
      contactId,
      projectId,
      Session_Package_type:   attrs.Session_Package_type   ?? null,
      Session_Project_domain: attrs.Session_Project_domain ?? null
    });
  } catch (err) {
    logger.warn("project-enrichment: contact update failed", {
      contactId,
      projectId,
      error: err.message
    });
  }
}
