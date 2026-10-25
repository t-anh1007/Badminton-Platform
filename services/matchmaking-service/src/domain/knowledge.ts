import { embed, rrf, topByCosine } from '@khoaluantn/ai';
import { aiSettings, type AiChains } from '../lib/aiClients.js';
import { prisma } from '../lib/prisma.js';

// Kho RAG trong PostgreSQL (tech design §7, T3): full-text `tsv` + cosine trong Node, gộp RRF k=60.

export type KnowledgeKind = 'rule' | 'precedent' | 'sample';
export interface KnowledgeInput { id: string; kind: KnowledgeKind; ref: string; text: string; metadata?: object }

const BRANCH_LIMIT = 20;

async function logEmbed(ai: AiChains, ok: boolean, latencyMs: number, errorCode?: string) {
  if (!ai.embedding) return;
  await prisma.aiCallLog.create({
    data: { purpose: 'embed', provider: ai.embedding.provider, model: ai.embedding.model, chainIndex: 0, ok, errorCode: errorCode ?? null, latencyMs },
  });
}

/** Gọi embedding; lỗi thì trả null (nhánh full-text vẫn chạy) và ghi AiCallLog. */
async function embedTexts(texts: string[], ai: AiChains): Promise<number[][] | null> {
  if (!ai.embedding || texts.length === 0) return null;
  const started = Date.now();
  try {
    const vectors = await embed(ai.embedding, texts, ai.embeddingDims, { timeoutMs: aiSettings().callTimeoutMs, fetchImpl: ai.fetchImpl });
    await logEmbed(ai, true, Date.now() - started);
    return vectors;
  } catch (error) {
    await logEmbed(ai, false, Date.now() - started, error instanceof Error ? error.message.slice(0, 60) : 'EMBED_FAILED');
    return null;
  }
}

/** Upsert theo id; đoạn không đổi chữ và đã có vector thì bỏ qua (không gọi embedding lại). */
export async function upsertChunks(chunks: KnowledgeInput[], deps: { ai: AiChains }): Promise<{ embedded: number; skipped: number }> {
  const existing = new Map((await prisma.knowledgeChunk.findMany({
    where: { id: { in: chunks.map((chunk) => chunk.id) } }, select: { id: true, text: true, embedding: true },
  })).map((row) => [row.id, row]));
  const changed = chunks.filter((chunk) => {
    const row = existing.get(chunk.id);
    return !row || row.text !== chunk.text || row.embedding.length === 0;
  });
  const vectors = await embedTexts(changed.map((chunk) => chunk.text), deps.ai);
  for (const [index, chunk] of changed.entries()) {
    const data = {
      kind: chunk.kind, ref: chunk.ref, text: chunk.text, metadata: chunk.metadata ?? {}, active: true,
      embedding: vectors?.[index] ?? [],
    };
    await prisma.knowledgeChunk.upsert({ where: { id: chunk.id }, create: { id: chunk.id, ...data }, update: data });
  }
  return { embedded: vectors ? changed.length : 0, skipped: chunks.length - changed.length };
}

let vectorCache: { stamp: number; rows: Array<{ id: string; kind: string; vector: number[] }> } | null = null;

/** Nạp toàn bộ vector đang active (≤ vài nghìn đoạn), làm mới khi có đoạn cập nhật sau lần nạp trước. */
async function activeVectors() {
  const latest = await prisma.knowledgeChunk.aggregate({ _max: { updatedAt: true }, _count: { _all: true }, where: { active: true } });
  const stamp = (latest._max.updatedAt?.getTime() ?? 0) + latest._count._all;
  if (!vectorCache || vectorCache.stamp !== stamp) {
    const rows = await prisma.knowledgeChunk.findMany({ where: { active: true }, select: { id: true, kind: true, embedding: true } });
    vectorCache = { stamp, rows: rows.filter((row) => row.embedding.length > 0).map((row) => ({ id: row.id, kind: row.kind, vector: row.embedding })) };
  }
  return vectorCache.rows;
}

/** Từ khóa → tsquery OR (chỉ chữ/số Unicode nên không cần thoát ký tự). */
function orQuery(query: string): string {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].join(' | ');
}

export async function searchKnowledge(
  query: string, opts: { kinds: KnowledgeKind[]; limit?: number }, deps: { ai: AiChains },
): Promise<Array<{ id: string; text: string }>> {
  const tsquery = orQuery(query);
  const fts = tsquery === '' ? [] : (await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM knowledge_chunks
    WHERE active AND kind = ANY(${opts.kinds}) AND tsv @@ to_tsquery('simple', ${tsquery})
    -- Chuẩn hoá 1 (chia 1 + log độ dài): đoạn BR dài không lấn đoạn ngắn đúng chủ đề.
    ORDER BY ts_rank(tsv, to_tsquery('simple', ${tsquery}), 1) DESC, id
    LIMIT ${BRANCH_LIMIT}`).map((row) => row.id);
  const queryVector = (await embedTexts([query], deps.ai))?.[0];
  const semantic = queryVector
    ? topByCosine(queryVector, (await activeVectors()).filter((row) => (opts.kinds as string[]).includes(row.kind)), BRANCH_LIMIT)
    : [];
  const ids = rrf([fts, semantic], 60, opts.limit ?? 6);
  const rows = await prisma.knowledgeChunk.findMany({ where: { id: { in: ids } }, select: { id: true, text: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is { id: string; text: string } => Boolean(row));
}
