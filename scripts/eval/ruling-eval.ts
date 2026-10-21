// Đánh giá NCKH phán quyết tạm tầng 2 (spec §10): chạy các ca mẫu scripts/knowledge/samples.json qua TỪNG mắt xích của
// AI_RULING_CHAIN (truy hồi RAG thật từ knowledge_chunks, loại chính ca mẫu đó để tránh lộ đáp án), so outcome với kết luận
// mẫu và chấm Faithfulness bằng AI_JUDGE (tỉ lệ lý do được đoạn trích dẫn hỗ trợ). Cần DB đã nạp kho (ingest.ts).
// Chạy: npx dotenv -e .env -- npx tsx scripts/eval/ruling-eval.ts [--dry]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseChain, proposeRuling, resetCircuitBreaker, runChain, type ChainLink, type Ruling, type RulingEvidence,
} from '../../packages/ai/src/index.js';
import { searchKnowledge } from '../../services/matchmaking-service/src/domain/knowledge.js';
import { knowledgeQuery } from '../../services/matchmaking-service/src/domain/disputeRulingJob.js';
import { aiChainsFromEnv } from '../../services/matchmaking-service/src/lib/aiClients.js';
import { prisma } from '../../services/matchmaking-service/src/lib/prisma.js';

interface Sample { id: string; summary: string; evidence: RulingEvidence[]; outcome: Ruling['outcome'] }

const root = fileURLToPath(new URL('../../', import.meta.url));
const dry = process.argv.includes('--dry');
const DRY_LINK: ChainLink = { provider: 'gemini', model: 'dry-echo', baseUrl: 'http://dry', apiKey: 'dry' };

/** --dry: AI giả trả đúng kết luận mẫu và trích đoạn đầu tiên; giám khảo giả luôn "hỗ trợ". */
function dryFetch(expected: () => Ruling['outcome']): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }>; response_format?: { json_schema: { name: string } } };
    const content = body.response_format?.json_schema.name === 'faithfulness'
      ? { supported: true }
      : {
          outcome: expected(), confidence: 0.9, adminNotes: 'dry',
          reasons: [{ text: 'dry', citations: [(JSON.parse(body.messages[1]!.content) as { rules: Array<{ id: string }> }).rules[0]!.id] }],
        };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
  }) as unknown as typeof fetch;
}

async function judge(link: ChainLink, reason: Ruling['reasons'][number], chunks: Map<string, string>, fetchImpl?: typeof fetch) {
  const cited = reason.citations.map((id) => `[${id}] ${chunks.get(id) ?? ''}`).join('\n');
  const result = await runChain([link], {
    messages: [
      { role: 'system', content: 'Bạn chấm xem lý do có được các đoạn trích dẫn hỗ trợ trực tiếp không. Chỉ trả JSON {"supported": true|false}.' },
      { role: 'user', content: `Lý do: ${reason.text}\nĐoạn trích dẫn:\n${cited}` },
    ],
    jsonSchema: { name: 'faithfulness', schema: { type: 'object', additionalProperties: false, required: ['supported'], properties: { supported: { type: 'boolean' } } } },
  }, (raw) => {
    const value = raw as { supported?: unknown };
    if (typeof value.supported !== 'boolean') throw new Error('bad judge output');
    return value.supported;
  }, { timeoutMs: 30_000, fetchImpl });
  return result.value;
}

async function main() {
  const samples = JSON.parse(readFileSync(`${root}scripts/knowledge/samples.json`, 'utf8')) as Sample[];
  let current: Sample = samples[0]!;
  const fetchImpl = dry ? dryFetch(() => current.outcome) : undefined;
  const links = dry ? [DRY_LINK] : parseChain(process.env.AI_RULING_CHAIN, process.env);
  const judgeLink = dry ? DRY_LINK : parseChain(process.env.AI_JUDGE, process.env)[0];
  if (links.length === 0) throw new Error('AI_RULING_CHAIN không có mắt xích nào đủ key; dùng --dry để thử script.');
  const ai = dry ? { ...aiChainsFromEnv({}), embedding: null } : aiChainsFromEnv();
  const rows: Array<Record<string, string>> = [];
  for (const link of links) {
    resetCircuitBreaker();
    let correct = 0;
    let failures = 0;
    let reasons = 0;
    let supported = 0;
    const latencies: number[] = [];
    for (const sample of samples) {
      current = sample;
      const hits = (await searchKnowledge(knowledgeQuery(sample.evidence), { kinds: ['rule', 'precedent', 'sample'], limit: 7 }, { ai }))
        .filter((hit) => hit.id !== `sample:${sample.id}`).slice(0, 6);
      const started = Date.now();
      const result = await proposeRuling([link], { caseRef: sample.id, format: 'bo3', evidence: sample.evidence, chunks: hits }, { timeoutMs: 90_000, fetchImpl });
      latencies.push(Date.now() - started);
      if (!result) { failures += 1; continue; }
      if (result.ruling.outcome === sample.outcome) correct += 1;
      if (!judgeLink) continue;
      const texts = new Map(hits.map((hit) => [hit.id, hit.text]));
      for (const reason of result.ruling.reasons) {
        reasons += 1;
        if (await judge(judgeLink, reason, texts, fetchImpl)) supported += 1;
      }
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    rows.push({
      'mắt xích': `${link.provider}:${link.model}`,
      'số ca': String(samples.length),
      '% đúng kết luận': ((100 * correct) / samples.length).toFixed(1),
      'lỗi/sai khuôn': String(failures),
      Faithfulness: judgeLink && reasons > 0 ? ((100 * supported) / reasons).toFixed(1) : 'chưa chấm (thiếu AI_JUDGE)',
      'trễ trung vị (ms)': String(sorted[Math.floor((sorted.length - 1) / 2)] ?? 0),
    });
  }
  console.table(rows);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
