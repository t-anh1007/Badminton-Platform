// Nạp kho RAG cho phán quyết tạm tầng 2 (tech design §7): mỗi dòng bảng BR của spec quét ảnh + competitive-matches §5
// là một đoạn, cộng các ca mẫu trong samples.json. Chạy lại khi spec đổi (upsert theo id, đoạn không đổi thì bỏ qua).
// Chạy: npx dotenv -e .env -- npx tsx scripts/knowledge/ingest.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { upsertChunks, type KnowledgeInput } from '../../services/matchmaking-service/src/domain/knowledge.js';
import { aiChainsFromEnv } from '../../services/matchmaking-service/src/lib/aiClients.js';
import { prisma } from '../../services/matchmaking-service/src/lib/prisma.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

/** Dòng bảng `| BR-XX-nn | nội dung |` → một đoạn luật. */
export function ruleRows(markdown: string): KnowledgeInput[] {
  const chunks: KnowledgeInput[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*(BR-[A-Z]+-\d+[a-z]?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (match) chunks.push({ id: match[1]!, kind: 'rule', ref: match[1]!, text: `${match[1]}: ${match[2]}` });
  }
  return chunks;
}

/** Chỉ §5 của competitive-matches.md (từ "## 5." tới "## 6."). */
function section5(markdown: string): string {
  const start = markdown.indexOf('\n## 5.');
  const end = markdown.indexOf('\n## 6.', start);
  return start < 0 ? '' : markdown.slice(start, end < 0 ? undefined : end);
}

interface Sample {
  id: string; summary: string; outcome: string;
  evidence: Array<{ team: string; supports: string; level: string; capturedAt: string | null; nearDuplicate: boolean; screenshot: boolean }>;
  reasons: Array<{ text: string; citations: string[] }>;
}

function sampleChunk(sample: Sample): KnowledgeInput {
  const evidence = sample.evidence.map((item) => `đội ${item.team} ủng hộ ${item.supports}, mức ${item.level}`
    + `${item.capturedAt ? '' : ', không có giờ chụp'}${item.nearDuplicate ? ', nghi trùng' : ''}${item.screenshot ? ', chụp màn hình' : ''}`).join('; ');
  return {
    id: `sample:${sample.id}`, kind: 'sample', ref: sample.id,
    text: `Ca mẫu: ${sample.summary} Bằng chứng: ${evidence}. Kết luận ${sample.outcome}. Lý do: ${sample.reasons.map((reason) => reason.text).join(' ')}`,
    metadata: { label: 'mẫu', outcome: sample.outcome },
  };
}

async function main() {
  const samples = JSON.parse(read('scripts/knowledge/samples.json')) as Sample[];
  const chunks = [
    ...ruleRows(read('docs/product/specs/result-ocr-autoconfirm.md')),
    ...ruleRows(section5(read('docs/product/specs/competitive-matches.md'))),
    ...samples.map(sampleChunk),
  ];
  const result = await upsertChunks(chunks, { ai: aiChainsFromEnv() });
  console.log(`Đã nạp ${chunks.length} đoạn (embedding mới ${result.embedded}, bỏ qua ${result.skipped}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().finally(() => prisma.$disconnect());
}
