// Chạy hàm dựng bản nháp của hệ thống (buildDraft) trên kết quả AI đọc từng ảnh, để biết bảng điểm người khai thấy.
// Giả lập: mỗi ảnh là một trận BO3, đội lấy từ map-*.json, ngưỡng ô = 0.9 (mặc định OCR_CELL_CONFIDENCE).
// Giới hạn: results-*.json không lưu index/conf từng ô, nên index = null (xếp theo thứ tự đọc), conf mỗi ô = minConf.
// Chạy: npx tsx ai-notes/eval/draft-sim.mts   File nháp, không commit.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildDraft } from '../../services/matchmaking-service/src/domain/confidence.js';

type Res = { file: string; sets: number[][] | null; minConf: number | null; isScreenshot: boolean | null; boards: number | null; unreadable: boolean | null; columns: { left: string | null; right: string | null } | null };
const load = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const out: Record<string, unknown> = {};
for (const [resPath, mapPath] of [['ai-notes/eval/results-real.json', 'ai-notes/eval/map-real.json'], ['ai-notes/eval/results-rf80.json', 'ai-notes/eval/map-rf80.json']]) {
  const map = load(mapPath);
  for (const r of load(resPath) as Res[]) {
    const m = map[r.file];
    const conf = r.minConf ?? 0;
    const reading = r.sets ? {
      boards: r.boards ?? 1, isScreenshot: !!r.isScreenshot, columns: r.columns ?? { left: null, right: null }, unreadable: !!r.unreadable,
      sets: r.sets.map(([left, right]) => ({ index: null, left, right, confLeft: conf, confRight: conf })),
    } : null;
    const now = new Date();
    const d = buildDraft(
      [{ uploadId: r.file, signals: { capturedAt: now, exactDuplicate: false, nearDuplicate: false, isScreenshot: !!r.isScreenshot, multipleBoards: false }, reading }],
      { format: 'bo3', teams: { A: [m.doi_A], B: [m.doi_B] }, match: { startAt: now, endAt: now }, cellThreshold: 0.9 },
    );
    out[r.file] = { sets: d.sets.map((s) => [s.teamA, s.teamB, s.lowConfidence]), columnMappedBy: d.columnMappedBy, level: d.level, reasons: d.reasons, manualEntry: d.manualEntry };
  }
}
writeFileSync('ai-notes/eval/draft-sim.json', JSON.stringify(out, null, 1));
console.log(Object.keys(out).length, 'ảnh');
