// Chạy chuỗi AI đọc ảnh (đúng thứ tự production) trên từng ảnh trong ai-notes/eval/samples-internet,
// ghi kết quả từng ảnh ra ai-notes/eval/results-real.json. File nháp, không commit.
// Chạy: npx dotenv -e .env -- npx tsx ai-notes/eval/run-real.ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseChain, readScoreImage, type CallLog } from '../../packages/ai/src/index.js';
import { prepareImage } from '../../services/matchmaking-service/src/domain/evidenceSignals.js';

const dir = process.argv[2] ?? 'ai-notes/eval/samples-internet/';
const files = readdirSync(dir).filter((f) => /.(png|jpe?g)$/i.test(f) && (process.argv[2] ? true : /^real/.test(f))).sort();
const links = parseChain(process.env.AI_OCR_CHAIN, process.env);
if (links.length === 0) throw new Error('AI_OCR_CHAIN trống');

const out: unknown[] = [];
for (const file of files) {
  const { aiJpegBase64 } = await prepareImage(readFileSync(dir + file));
  const logs: CallLog[] = [];
  const started = Date.now();
  let result: Awaited<ReturnType<typeof readScoreImage>> = null;
  let error = '';
  try {
    result = await readScoreImage(links, { jpegBase64: aiJpegBase64, discipline: 'singles', format: 'bo3' }, { timeoutMs: 30_000, onCall: (l) => logs.push(l) });
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const r = result?.reading;
  const confs = r ? r.sets.flatMap((s) => [s.confLeft, s.confRight]) : [];
  const row = {
    file, latencyMs: Date.now() - started, model: result ? `${result.link.provider}:${result.link.model}` : null,
    attempts: logs.map((l) => `${l.provider}:${l.ok ? 'ok' : l.errorCode ?? 'fail'}`),
    sets: r?.sets.map((s) => [s.left, s.right]) ?? null, minConf: confs.length ? Math.min(...confs) : null,
    isScreenshot: r?.isScreenshot ?? null, boards: r?.boards ?? null, unreadable: r?.unreadable ?? null, columns: r?.columns ?? null, error,
  };
  out.push(row);
  console.log(file, JSON.stringify(row.sets), row.minConf, row.model, row.latencyMs + 'ms', row.error);
}
writeFileSync(process.argv[3] ?? 'ai-notes/eval/results-real.json', JSON.stringify(out, null, 1));
