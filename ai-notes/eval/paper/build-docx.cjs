// Chuyen bao-cao-ket-qua.md -> bao-cao-ket-qua.docx (+ phu luc 59 anh). File nhap.
// Chay: node ai-notes/eval/paper/build-docx.cjs <thu-muc-node_modules-co-docx> [ten-file-md-khong-duoi]
const path = require('path'), fs = require('fs');
const D = require(path.join(process.argv[2], 'docx'));
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  ImageRun, TableOfContents, AlignmentType, LevelFormat, BorderStyle, PageBreak, Footer, PageNumber } = D;
const DIR = __dirname;
const NAME = process.argv[3] || 'bao-cao-ket-qua';
const md = fs.readFileSync(path.join(DIR, NAME + '.md'), 'utf8').replace(/\r/g, '').split('\n');
const FONT = 'Arial', W = 9026; // A4, le 1 inch

function runs(text, base = {}) {
  const out = []; const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g; let i = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > i) out.push(new TextRun({ text: text.slice(i, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: 'Consolas', ...base }));
    else out.push(new TextRun({ text: t.slice(1, t.indexOf(']')), ...base }));
    i = m.index + t.length;
  }
  if (i < text.length) out.push(new TextRun({ text: text.slice(i), ...base }));
  return out;
}
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
const borders = { top: border, bottom: border, left: border, right: border };
function table(rows, fontSize = 18) {
  const n = rows[0].length;
  const lens = rows[0].map((_, c) => Math.max(...rows.map(r => Math.min((r[c] || '').length, 60)), 4));
  const tot = lens.reduce((a, b) => a + b, 0);
  const widths = lens.map(l => Math.floor(W * l / tot)); widths[n - 1] += W - widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((r, ri) => new TableRow({
      tableHeader: ri === 0,
      children: r.map((c, ci) => new TableCell({
        borders, width: { size: widths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: 'E8EEF4', color: 'auto' } : undefined,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: [new Paragraph({ children: runs(c || '', { size: fontSize, bold: ri === 0 || undefined }) })],
      })),
    })),
  });
}
const kids = []; let inst = 0;
for (let i = 0; i < md.length; i++) {
  const l = md[i];
  if (!l.trim()) continue;
  if (l.trim() === '[[TOC]]') {
    kids.push(new Paragraph({ children: [new TextRun({ text: 'Mục lục', bold: true, size: 26, color: '1F3864' })] }));
    kids.push(new TableOfContents('Mục lục', { hyperlink: true, headingStyleRange: '1-2' }));
    kids.push(new Paragraph({ children: [new PageBreak()] }));
    continue;
  }
  if (l.startsWith('```')) { // code block
    const code = []; i++; while (i < md.length && !md[i].startsWith('```')) code.push(md[i++]);
    code.forEach(c => kids.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: 'F3F3F3', color: 'auto' }, children: [new TextRun({ text: c, font: 'Consolas', size: 18 })] })));
    continue;
  }
  let h = l.match(/^(#{1,3}) (.*)/);
  if (h) { kids.push(new Paragraph({ heading: [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2][h[1].length - 1], children: runs(h[2]) })); continue; }
  if (l.startsWith('|')) {
    const rows = []; while (i < md.length && md[i].startsWith('|')) {
      if (!/^\|[\s\-|:]+\|$/.test(md[i])) rows.push(md[i].slice(1, -1).split('|').map(s => s.trim()));
      i++;
    } i--; kids.push(table(rows)); kids.push(new Paragraph({ children: [] })); continue;
  }
  const img = l.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (img) {
    const buf = fs.readFileSync(path.join(DIR, img[2]));
    const w = buf.readUInt32BE(16), hh = buf.readUInt32BE(20); const tw = Math.min(520, w);
    kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: buf, transformation: { width: tw, height: Math.round(tw * hh / w) } })] }));
    kids.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: img[1], italics: true, size: 18 })] }));
    continue;
  }
  if (l.startsWith('> ')) { kids.push(new Paragraph({ indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '7A9CC6', space: 8 } }, children: runs(l.slice(2), { italics: true }) })); continue; }
  const li = l.match(/^(\d+)\. (.*)/);
  if (li) { if (!/^\d+\. /.test(md[i - 1] || '')) inst++; kids.push(new Paragraph({ numbering: { reference: 'num', level: 0, instance: inst }, children: runs(li[2]) })); continue; }
  if (l.startsWith('- ')) { kids.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, children: runs(l.slice(2)) })); continue; }
  kids.push(new Paragraph({ children: runs(l) }));
}

// Phu luc: bang 59 anh (chi cho bao cao day du)
if (!process.argv[3]) {
const E = path.join(DIR, '..');
const data = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(E, 'likert-data.js'), 'utf8').slice('window.DATA = '.length).trim().replace(/;$/, '')).map(r => [r.id, r]));
const per = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(DIR, 'per-image.json'), 'utf8')).map(r => [r.f, r]));
const TX = { 'Dung': 'Đúng', 'Sai chu so/o diem': 'Sai chữ số', 'Thieu van': 'Thiếu ván', 'Doc cot thanh hang': 'Cột thành hàng', 'Khong doc duoc': 'Không đọc được', 'Thua van': 'Thừa ván' };
const rows = [['#', 'Ảnh', 'Bộ', 'Mô hình', 'Tỉ số thật', 'AI đọc', 'Tin cậy', '①', '②', 'Mức HT', 'Kiểu']];
fs.readFileSync(path.join(E, 'graded-59.txt'), 'utf8').trim().split(/\r?\n/).forEach((line, k) => {
  const [f, t, l1, l2] = line.split('|'); const d = data[f], p = per[f];
  rows.push([String(k + 1), f.replace(/\.(png|jpg)$/, ''), d.set === 'real32' ? 'Thật' : 'Roboflow', d.model === 'gemini' ? 'Gemini' : 'Cloudflare',
    t.split(';').map(s => s.trim()).join(' · '), d.ai.length ? d.ai.map(s => s.join('-')).join(' · ') : '(không trả)',
    d.conf == null ? '–' : d.conf.toFixed(2).replace('.', ','), l1, l2, p.prod === 'green' ? 'Xanh' : 'Vàng', TX[p.taxo]]);
});
kids.push(new Paragraph({ children: [new PageBreak()] }));
kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Phụ lục A. Dữ liệu từng ảnh (59 mẫu)')] }));
kids.push(new Paragraph({ children: runs('Nguồn: `graded-59.txt` (tỉ số thật, Likert do PO nhập) và `likert-data.js` (kết quả AI). "Mức HT" là mức Xanh/Vàng hệ thống hiện tại trả về; "Kiểu" là phân loại lỗi tự động.') }));
kids.push(table(rows, 16));
}

const hd = (size, before, after) => ({ run: { font: FONT, size, bold: true, color: '1F3864' }, paragraph: { spacing: { before, after }, keepNext: true } });
const doc = new Document({
  creator: 'CourtIn NCKH', title: 'Báo cáo kết quả thử nghiệm AI đọc ảnh bảng tỉ số',
  styles: {
    default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { after: 100, line: 288 } } },
      title: hd(34, 0, 200), heading1: hd(28, 280, 120), heading2: hd(24, 220, 100) },
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 260 } } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 500, hanging: 300 } } } }] },
  ] },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], size: 18 })] })] }) },
    children: kids,
  }],
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(path.join(DIR, NAME + '.docx'), b); console.log('ok', b.length); });
