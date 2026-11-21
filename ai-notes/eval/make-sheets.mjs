// Tạm: sinh ảnh bảng tỉ số giả (dữ liệu của team, BR-RA-61) + labels.json cho scripts/eval/ocr-eval.ts.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('../../services/matchmaking-service/node_modules/sharp');
const dir = new URL('./ocr/', import.meta.url);

const table = ({ left, right, sets, font = 'Arial', tilt = 0 }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
  <rect width="100%" height="100%" fill="#fbfaf3"/>
  <g transform="rotate(${tilt} 600 450)" font-family="${font}" fill="#1b2a6b">
    <text x="80" y="110" font-size="52">Kết quả trận cầu lông</text>
    <line x1="80" y1="170" x2="1120" y2="170" stroke="#333" stroke-width="3"/>
    <text x="300" y="240" font-size="46">${left}</text>
    <text x="760" y="240" font-size="46">${right}</text>
    ${sets.map(([a, b], i) => `
      <text x="100" y="${340 + i * 120}" font-size="44">Set ${i + 1}</text>
      <text x="360" y="${340 + i * 120}" font-size="72">${a}</text>
      <text x="820" y="${340 + i * 120}" font-size="72">${b}</text>`).join('')}
  </g>
</svg>`;

const flip = ([a, b]) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <rect width="100%" height="100%" fill="#2b2b2b"/>
  <rect x="150" y="150" width="380" height="500" rx="20" fill="#f2f2f2"/>
  <rect x="670" y="150" width="380" height="500" rx="20" fill="#f2f2f2"/>
  <text x="340" y="500" font-family="Arial Black, Arial" font-size="300" text-anchor="middle" fill="#c0392b">${a}</text>
  <text x="860" y="500" font-family="Arial Black, Arial" font-size="300" text-anchor="middle" fill="#1f4e9c">${b}</text>
</svg>`;

const sheets = [
  { file: 'sheet-1.jpg', svg: table({ left: 'Minh - Hùng', right: 'Lan - Phúc', sets: [[21, 18], [19, 21], [21, 15]] }), sets: [[21, 18], [19, 21], [21, 15]], left: 'Minh - Hùng', right: 'Lan - Phúc' },
  { file: 'sheet-2.jpg', svg: table({ left: 'Tuấn', right: 'Nam', sets: [[15, 21], [18, 21]], font: 'Comic Sans MS', tilt: -4 }), sets: [[15, 21], [18, 21]], left: 'Tuấn', right: 'Nam' },
  { file: 'sheet-3.jpg', svg: flip([21, 17]), sets: [[21, 17]] },
  { file: 'sheet-4.jpg', svg: table({ left: 'Đội A', right: 'Đội B', sets: [[22, 20], [21, 19]], tilt: 6 }), sets: [[22, 20], [21, 19]], left: 'Đội A', right: 'Đội B', blur: 2 },
];

for (const sheet of sheets) {
  let image = sharp(Buffer.from(sheet.svg));
  if (sheet.blur) image = image.blur(sheet.blur);
  await image.jpeg({ quality: 85 }).toFile(fileURLToPath(new URL(sheet.file, dir)));
}
writeFileSync(new URL('labels.json', dir), JSON.stringify(sheets.map(({ file, sets, left, right }) => ({ file, sets, left, right })), null, 2));
console.log(`Đã tạo ${sheets.length} ảnh trong ai-notes/eval/ocr/`);
