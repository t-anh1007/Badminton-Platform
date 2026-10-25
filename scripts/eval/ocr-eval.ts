// Đánh giá NCKH độ chính xác đọc ảnh bảng tỉ số (spec §10): chạy TỪNG mắt xích của AI_OCR_CHAIN riêng lẻ trên bộ ảnh có
// nhãn ai-notes/eval/ocr/labels.json ([{ file, sets: [[trái, phải], …], left?, right? }]), in % ô đúng, % bên thắng đúng,
// độ trễ trung vị, token trung bình. Ảnh và nhãn chỉ là dữ liệu giả của team, không commit (BR-RA-61).
// Chạy: npx dotenv -e .env -- npx tsx scripts/eval/ocr-eval.ts [--dry]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseChain, readScoreImage, resetCircuitBreaker, type CallLog, type ChainLink, type OcrReading } from '../../packages/ai/src/index.js';
import { prepareImage } from '../../services/matchmaking-service/src/domain/evidenceSignals.js';
import { inferMatchOutcome } from '../../services/matchmaking-service/src/domain/matchRules.js';

interface Label { file: string; sets: Array<[number, number]>; left?: string; right?: string }

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = `${root}ai-notes/eval/ocr/`;
const dry = process.argv.includes('--dry');

function winner(sets: Array<[number, number]>): string {
  try {
    return inferMatchOutcome({ format: sets.length > 3 ? 'bo5' : 'bo3', sets: sets.map(([teamA, teamB]) => ({ teamA, teamB })) }).outcome;
  } catch {
    return 'INVALID';
  }
}

/** --dry: một mắt xích giả trả đúng nhãn để kiểm tra script chạy hết, không gọi mạng. */
function dryChain(labels: Label[]): { links: ChainLink[]; fetchImpl: typeof fetch } {
  let index = 0;
  const fetchImpl = (async () => {
    const label = labels[index++ % labels.length]!;
    const reading: OcrReading = {
      boards: 1, isScreenshot: false, columns: { left: label.left ?? null, right: label.right ?? null }, unreadable: false,
      sets: label.sets.map(([left, right], position) => ({ index: position + 1, left, right, confLeft: 0.95, confRight: 0.95 })),
    };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reading) } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }));
  }) as unknown as typeof fetch;
  return { links: [{ provider: 'gemini', model: 'dry-echo', baseUrl: 'http://dry', apiKey: 'dry' }], fetchImpl };
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)]!;
};

async function main() {
  const labels = JSON.parse(readFileSync(`${dir}labels.json`, 'utf8')) as Label[];
  const { links, fetchImpl } = dry ? dryChain(labels) : { links: parseChain(process.env.AI_OCR_CHAIN, process.env), fetchImpl: undefined };
  if (links.length === 0) throw new Error('AI_OCR_CHAIN không có mắt xích nào đủ key; dùng --dry để thử script.');
  const rows: Array<Record<string, string>> = [];
  for (const link of links) {
    resetCircuitBreaker();
    let cells = 0;
    let correctCells = 0;
    let correctWinners = 0;
    let failures = 0;
    const latencies: number[] = [];
    const tokens: number[] = [];
    for (const label of labels) {
      const { aiJpegBase64 } = await prepareImage(readFileSync(`${dir}${label.file}`));
      const logs: CallLog[] = [];
      const started = Date.now();
      const result = await readScoreImage([link], { jpegBase64: aiJpegBase64, discipline: 'doubles', format: label.sets.length > 3 ? 'bo5' : 'bo3' },
        { timeoutMs: 30_000, fetchImpl, onCall: (log) => logs.push(log) });
      latencies.push(Date.now() - started);
      tokens.push(logs.reduce((sum, log) => sum + (log.tokensIn ?? 0) + (log.tokensOut ?? 0), 0));
      cells += label.sets.length * 2;
      if (!result) { failures += 1; continue; }
      const read = result.reading.sets.map((set) => [set.left, set.right] as [number, number]);
      label.sets.forEach(([left, right], index) => {
        if (read[index]?.[0] === left) correctCells += 1;
        if (read[index]?.[1] === right) correctCells += 1;
      });
      if (winner(read) === winner(label.sets)) correctWinners += 1;
    }
    rows.push({
      'mắt xích': `${link.provider}:${link.model}`,
      'số ảnh': String(labels.length),
      '% ô đúng': `${((100 * correctCells) / Math.max(1, cells)).toFixed(1)}`,
      '% bên thắng đúng': `${((100 * correctWinners) / Math.max(1, labels.length)).toFixed(1)}`,
      'lỗi': String(failures),
      'trễ trung vị (ms)': String(median(latencies)),
      'token TB': (tokens.reduce((a, b) => a + b, 0) / Math.max(1, tokens.length)).toFixed(0),
    });
  }
  console.table(rows);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
