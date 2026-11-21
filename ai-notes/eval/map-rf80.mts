// Ghép cột (mapColumns của hệ thống) cho 80 ảnh Roboflow, đội giả lập theo video, đội A xáo theo seed. File nháp.
// Chạy: npx tsx ai-notes/eval/map-rf80.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { mapColumns } from '../../services/matchmaking-service/src/domain/confidence.js';

// [người hàng trên, người hàng dưới] theo video
const V: Record<string, [string, string]> = {
  Aadya: ['Variyath Aadya', 'Chua Hui Zhen Grace'],
  frame: ['Lee Chong Wei', 'Lin Dan'],
  frame1: ['Lee Hyun-il', 'Lin Dan'],
  frame2: ['Chan Yin Chak', 'Kartikey Gulshan Kumar'],
};
let seed = 20261110;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const results = JSON.parse(readFileSync('ai-notes/eval/results-rf80.json', 'utf8')) as Array<{ file: string; columns: { left: string | null; right: string | null } | null }>;
const out: Record<string, unknown> = {};
for (const r of results) {
  const [top, bottom] = V[r.file.replace(/_\d+\.jpg$/, '')]!;
  const topIsA = true; rand(); // quy ước PO 09/11: người xếp trước trên ảnh (trên/trái) = Đội A
  const teams = { A: [topIsA ? top : bottom], B: [topIsA ? bottom : top] };
  const labels = r.columns ?? { left: null, right: null };
  const m = mapColumns(labels, teams);
  out[r.file] = { ten_tren_anh: `${labels.left ?? '∅'} | ${labels.right ?? '∅'}`, doi_A: teams.A[0], doi_B: teams.B[0],
    raw: m, top, bottom, ghep: m === null ? 'khong_tu_ghep' : m === (topIsA ? 'left_is_A' : 'left_is_B') ? 'dung' : 'trao' };
}
writeFileSync('ai-notes/eval/map-rf80.json', JSON.stringify(out, null, 1));
console.log(Object.values(out).reduce((c: Record<string, number>, v: any) => ((c[v.ghep] = (c[v.ghep] ?? 0) + 1), c), {}));
