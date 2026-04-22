import { config } from "./config.js";

function buildUrl(tableId, query = {}) {
  const url = new URL(`${config.nocodb.baseUrl}${config.nocodb.apiPath}/tables/${tableId}/records`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function ncFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "xc-token": config.nocodb.apiToken,
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`NocoDB request failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

export async function listRecords(tableId, query = {}) {
  return ncFetch(buildUrl(tableId, query), { method: "GET" });
}

export async function createRecord(tableId, body) {
  return ncFetch(buildUrl(tableId), { method: "POST", body: JSON.stringify(body) });
}

export async function updateRecord(tableId, rowId, body) {
  // NocoDB v2: PATCH body に Id を含める (パスには付けない)
  return ncFetch(buildUrl(tableId), { method: "PATCH", body: JSON.stringify({ Id: rowId, ...body }) });
}
