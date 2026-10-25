import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma.js';
import { searchKnowledge, upsertChunks } from '../src/domain/knowledge.js';
import type { AiChains } from '../src/lib/aiClients.js';

const run = randomUUID().slice(0, 8);
const id = (ref: string) => `${ref}#test-${run}`;

afterAll(async () => {
  await prisma.knowledgeChunk.deleteMany({ where: { id: { contains: `#test-${run}` } } });
  await prisma.$disconnect();
});

/** Embedding giả: túi từ băm vào 16 chiều — đủ để cosine phân biệt chủ đề. */
function hashVector(text: string): number[] {
  const vector = new Array(16).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.codePointAt(0)!) % 16;
    vector[hash] += 1;
  }
  return vector;
}

function aiWith(embeddingOk: boolean): AiChains {
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    if (!embeddingOk) return new Response('{}', { status: 500 });
    const { input } = JSON.parse(String(init.body)) as { input: string[] };
    return new Response(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: hashVector(text) })) }));
  }) as unknown as typeof fetch;
  return {
    ocr: [], ruling: [], embeddingDims: 16, fetchImpl,
    embedding: { provider: 'gemini', model: 'emb-test', baseUrl: 'https://g.test', apiKey: 'k' },
  };
}

const rules = [
  { id: id('BR-RA-17'), kind: 'rule' as const, ref: 'BR-RA-17', text: 'Đỏ chỉ khi bản khai có ảnh lạ: ảnh trùng chính xác ảnh của hồ sơ khác, hoặc chụp trước giờ đánh.' },
  { id: id('BR-RA-20'), kind: 'rule' as const, ref: 'BR-RA-20', text: 'Cửa sổ phản hồi tính từ lúc có kết quả đề xuất: Xanh 2 giờ, Vàng 6 giờ, Đỏ 12 giờ.' },
  { id: id('BR-RA-38'), kind: 'rule' as const, ref: 'BR-RA-38', text: 'Kháng nghị chỉ thành viên bên bị xử thua, trong 6 giờ, kèm ảnh mới hoặc chỉ ra điểm sai.' },
];

describe('hybrid knowledge base', () => {
  it('finds the duplicate-photo rule in the top 3 (full-text + vectors)', async () => {
    expect(await upsertChunks(rules, { ai: aiWith(true) })).toEqual({ embedded: 3, skipped: 0 });
    const hits = await searchKnowledge('ảnh trùng hồ sơ khác', { kinds: ['rule'] }, { ai: aiWith(true) });
    // DB dev có thể đã nạp spec thật (scripts/knowledge/ingest.ts): chấp nhận đoạn BR-RA-17 thật hoặc của test.
    expect(hits.slice(0, 3).some((hit) => hit.id.startsWith('BR-RA-17'))).toBe(true);
  });

  it('still answers from full-text when embedding fails, and logs the failure', async () => {
    const before = await prisma.aiCallLog.count({ where: { purpose: 'embed', ok: false, model: 'emb-test' } });
    const hits = await searchKnowledge('ảnh trùng hồ sơ khác', { kinds: ['rule'] }, { ai: aiWith(false) });
    expect(hits.slice(0, 3).some((hit) => hit.id.startsWith('BR-RA-17'))).toBe(true);
    expect(await prisma.aiCallLog.count({ where: { purpose: 'embed', ok: false, model: 'emb-test' } })).toBe(before + 1);
    await prisma.aiCallLog.deleteMany({ where: { model: 'emb-test' } });
  });

  it('filters by kind', async () => {
    const hits = await searchKnowledge('ảnh trùng hồ sơ khác', { kinds: ['precedent'] }, { ai: aiWith(true) });
    expect(hits.some((hit) => hit.id.endsWith(`#test-${run}`))).toBe(false);
  });

  it('re-upserting the same id does not duplicate and skips unchanged text', async () => {
    expect(await upsertChunks(rules, { ai: aiWith(true) })).toEqual({ embedded: 0, skipped: 3 });
    expect(await prisma.knowledgeChunk.count({ where: { id: { contains: `#test-${run}` } } })).toBe(3);
  });
});
