import {
  queryDatabase,
  buildBodyFromProperties,
  getPageText,
  resolvePublishedToBot,
  getPageTitle,
  getPageTags,
  getPageUrl
} from "./notion-client.js";
import { listRecords, createRecord, updateRecord } from "../nocodb.js";
import { config } from "../config.js";

const SOURCE_NAME = "notion_faq";
const SOURCE_TYPE = "notion_faq";

function getChunksTableId() {
  return config.nocodb?.tables?.knowledgeChunks ?? process.env.NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID ?? "";
}

function getSourcesTableId() {
  return config.nocodb?.tables?.knowledgeSources ?? "";
}

function getDefaultPublishedToBot() {
  return process.env.NOTION_FAQ_DEFAULT_PUBLISHED_TO_BOT !== "false";
}

export function buildChunkId(pageId) {
  return `notion_faq_${pageId}`;
}

async function pageToChunk(page) {
  const title = getPageTitle(page);
  const tags = getPageTags(page);
  const url = getPageUrl(page) ?? null;

  const defaultPub = getDefaultPublishedToBot();
  const { value: publishedToBot, source: publishedSource } = resolvePublishedToBot(page, defaultPub);

  let body = buildBodyFromProperties(page);
  let bodySource = "properties";

  if (!body) {
    try {
      body = await getPageText(page.id);
      bodySource = body ? "blocks" : "empty";
    } catch (err) {
      console.warn(`[notion faq] body blocks 取得失敗 page_id=${page.id}: ${err.message}`);
      bodySource = "empty";
    }
  }

  return {
    chunk: {
      chunk_id: buildChunkId(page.id),
      source_name: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      origin_record_id: page.id,
      title,
      body,
      url,
      tags: JSON.stringify(tags),
      published_to_bot: publishedToBot,
      is_active: true,
      reusable: true,
      freshness_score: 0.8,
      updated_at: page.last_edited_time ?? new Date().toISOString()
    },
    publishedSource,
    bodySource,
    bodyLength: body.length
  };
}

async function findExistingChunk(tableId, chunkId) {
  try {
    const data = await listRecords(tableId, {
      where: `(chunk_id,eq,${chunkId})`,
      limit: 1
    });
    return data?.list?.[0] ?? null;
  } catch {
    return null;
  }
}

async function ensureSourceRegistered(sourcesTableId) {
  let existing = null;
  try {
    const data = await listRecords(sourcesTableId, {
      where: "(source_type,eq,notion_faq)",
      limit: 1
    });
    existing = data?.list?.[0] ?? null;
  } catch { /* ignore */ }

  const now = new Date().toISOString();

  if (existing) {
    await updateRecord(sourcesTableId, existing.Id, {
      last_synced_at: now,
      freshness_status: "fresh"
    });
  } else {
    await createRecord(sourcesTableId, {
      source_name: SOURCE_NAME,
      source_type: SOURCE_TYPE,
      source_url_or_path: `notion:${process.env.NOTION_FAQ_DATABASE_ID ?? ""}`,
      is_active: true,
      freshness_status: "fresh",
      last_synced_at: now
    });
  }
}

async function upsertChunk(tableId, chunk) {
  const existing = await findExistingChunk(tableId, chunk.chunk_id);
  if (existing) {
    await updateRecord(tableId, existing.Id, chunk);
    return "updated";
  }
  await createRecord(tableId, chunk);
  return "created";
}

/**
 * Notion FAQ DB → NocoDB knowledge_chunks の同期を実行する。
 * @returns {{ fetched: number, created: number, updated: number, skipped: number, failed: number }}
 */
export async function syncNotionFaq() {
  const databaseId = process.env.NOTION_FAQ_DATABASE_ID;
  if (!databaseId) throw new Error("NOTION_FAQ_DATABASE_ID is not set");

  const chunksTableId = getChunksTableId();
  if (!chunksTableId) throw new Error("NOCODB_KNOWLEDGE_CHUNKS_TABLE_ID is not set");

  const sourcesTableId = getSourcesTableId();

  console.log(`[sync notion_faq] 開始 database=${databaseId} chunks_table=${chunksTableId}`);

  let pages;
  try {
    pages = await queryDatabase(databaseId);
  } catch (err) {
    throw new Error(`Notion FAQ ページ取得失敗: ${err.message}`);
  }

  console.log(`[sync notion_faq] ${pages.length} ページ取得`);

  const stats = { fetched: pages.length, created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const page of pages) {
    const pageId = page.id;
    let result;

    try {
      result = await pageToChunk(page);
    } catch (err) {
      console.warn(`[sync notion_faq] chunk 生成失敗 page_id=${pageId}: ${err.message}`);
      stats.failed++;
      continue;
    }

    const { chunk, bodyLength, bodySource } = result;

    if (!chunk.title && bodyLength === 0) {
      stats.skipped++;
      continue;
    }

    if (bodyLength === 0) {
      console.log(`[sync notion_faq] skip (empty_body) page_id=${pageId} title="${chunk.title}" body_source=${bodySource}`);
      stats.skipped++;
      continue;
    }

    try {
      const upsertResult = await upsertChunk(chunksTableId, chunk);
      stats[upsertResult]++;
    } catch (err) {
      console.warn(`[sync notion_faq] upsert 失敗 ${chunk.chunk_id}: ${err.message}`);
      stats.failed++;
    }
  }

  if (sourcesTableId) {
    try {
      await ensureSourceRegistered(sourcesTableId);
    } catch (err) {
      console.warn(`[sync notion_faq] knowledge_sources 更新失敗 (非致命的): ${err.message}`);
    }
  }

  console.log(
    `[sync notion_faq] 完了 fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed}`
  );

  return stats;
}
