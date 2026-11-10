// Chạy hàm ghép cột của hệ thống (mapColumns) trên nhãn cột AI đã đọc, với đội giả lập cho từng ảnh.
// Tên đầy đủ như người dùng đăng ký; ai là đội A được xáo theo seed. File nháp, không commit.
// Chạy: npx tsx ai-notes/eval/map-real.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { mapColumns } from '../../services/matchmaking-service/src/domain/confidence.js';

// [người hàng trên/trái trên bảng, người hàng dưới/phải]; null = bảng không in tên
const P: Record<string, [string, string] | null> = {
  'real01.png': ['Prannoy H. S.', 'Lê Đức Phát'], 'real02.png': ['Prannoy H. S.', 'Lê Đức Phát'],
  'real03.png': ['Fabio Caponio', 'Lê Đức Phát'], 'real04.png': ['Fabio Caponio', 'Lê Đức Phát'],
  'real05.png': ['Lê Đức Phát', 'Viren Nettasinghe'], 'real06.png': ['Lê Đức Phát', 'Viren Nettasinghe'],
  'real07.png': ['Kai Schaefer', 'Lê Đức Phát'], 'real08.png': ['Kai Schaefer', 'Lê Đức Phát'], 'real09.png': ['Kai Schaefer', 'Lê Đức Phát'],
  'real10.jpg': null, 'real11.jpg': null, 'real12.jpg': null, 'real17.jpg': null, 'real19.jpg': null,
  'real13.jpg': ['Nguyễn Thùy Linh', 'Vũ Thị Trang'], 'real14.jpg': ['Nguyễn Thùy Linh', 'Vũ Thị Trang'], 'real15.jpg': ['Nguyễn Thùy Linh', 'Vũ Thị Trang'],
  'real16.jpg': ['Wang Yu Si', 'Nguyễn Thùy Linh'], 'realR2.jpg': ['Wang Yu Si', 'Nguyễn Thùy Linh'],
  'real20.png': ['Nguyễn Thùy Linh', 'Nozomi Okuhara'], 'real21.png': ['Nguyễn Thùy Linh', 'Nozomi Okuhara'],
  'real22.png': ['Vũ Thị Trang', 'Mia Blichfeldt'], 'real23.png': ['Vũ Thị Trang', 'Mia Blichfeldt'], 'real24.png': ['Vũ Thị Trang', 'Mia Blichfeldt'],
  'real25.png': ['Vũ Thị Trang', 'Tai Tzu Ying'], 'real26.png': ['Vũ Thị Trang', 'Tai Tzu Ying'],
  'real28.png': ['Beiwen Zhang', 'Nguyễn Thùy Linh'], 'real29.png': ['Beiwen Zhang', 'Nguyễn Thùy Linh'],
  'real30.jpg': ['Bilqis Prasista', 'Nguyễn Thùy Linh'], 'real31.jpg': ['Bilqis Prasista', 'Nguyễn Thùy Linh'],
  'real32.png': ['Vũ Thị Anh Thư', 'Akari Kurihara'], 'realR1.png': ['Vũ Thị Anh Thư', 'Akari Kurihara'],
};
let seed = 20261109;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const results = JSON.parse(readFileSync('ai-notes/eval/results-real.json', 'utf8')) as Array<{ file: string; columns: { left: string | null; right: string | null } | null }>;
const out: Record<string, unknown> = {};
for (const r of results) {
  const p = P[r.file];
  const topIsA = true; rand(); // quy ước PO 09/11: người xếp trước trên ảnh (trên/trái) = Đội A
  if (!p) { out[r.file] = { co_ten: false, ten_tren_anh: '', doi_A: 'Nguyễn Văn An', doi_B: 'Trần Văn Bình', ket_qua_ghep: 'khong_tu_ghep', ghep: 'khong_tu_ghep' }; continue; }
  const [top, bottom] = p;
  const teams = { A: [topIsA ? top : bottom], B: [topIsA ? bottom : top] };
  const labels = r.columns ?? { left: null, right: null };
  const m = mapColumns(labels, teams);
  const expected = topIsA ? 'left_is_A' : 'left_is_B';
  out[r.file] = { top, bottom, co_ten: true, ten_tren_anh: `${labels.left ?? '∅'} | ${labels.right ?? '∅'}`, doi_A: teams.A[0], doi_B: teams.B[0],
    ket_qua_ghep: m ?? 'khong_tu_ghep', ghep: m === null ? 'khong_tu_ghep' : m === expected ? 'dung' : 'trao' };
}
writeFileSync('ai-notes/eval/map-real.json', JSON.stringify(out, null, 1));
for (const [f, v] of Object.entries(out)) console.log(f, JSON.stringify(v));
