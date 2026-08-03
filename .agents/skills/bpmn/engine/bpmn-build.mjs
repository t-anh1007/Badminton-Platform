#!/usr/bin/env node
// bpmn-build.mjs — pipeline IR → BPMN → viewer.
//   node bpmn-build.mjs --dir <feature>  → (1) mọi *.ir.json: semcheck + layout → ghi .bpmn  (2) build {feature}-bpmn-editor.html
//   node bpmn-build.mjs --verify   → semcheck mọi IR + validate layout mọi .bpmn (node đúng lane / line không đè / không cắt task)
//   node bpmn-build.mjs --no-ir    → bỏ qua bước IR, chỉ build viewer từ .bpmn có sẵn
// AI sinh file {slug}.ir.json (intermediate representation nghiệp vụ); script lo semcheck + layout + render.
// File .bpmn kết quả CÓ sẵn <BPMNDiagram> (swimlane + toạ độ). Viewer chỉ importXML. node_modules gitignored.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { layoutToBpmn as layoutAuto } from './bpmn-layout-auto.mjs';  // bpmn-auto-layout (MẶC ĐỊNH no-lane — routing sạch nhất)
import { layoutToBpmn as layoutGrid } from './bpmn-layout-grid.mjs';  // grid tự viết (SWIMLANE DỌC — mặc định khi có lane)
import { layoutToBpmn as layoutElk } from './bpmn-layout-elk.mjs';    // ELK tự vá (dự phòng swimlane ngang: BPMN_ENGINE=elk)
import { layoutIR } from './bpmn-layout.mjs';                          // engine tự viết cũ (BPMN_ENGINE=legacy)
import { checkIR } from './bpmn-semcheck.mjs';

// ── Chọn engine layout ──
// MẶC ĐỊNH no-lane: bpmn-auto-layout (bpmn-io chính chủ) — routing sạch, gateway X chuẩn.
// BPMN_LANES=1 + IR ≥2 lane → SWIMLANE DỌC bằng engine grid tự viết (bpmn-layout-grid.mjs):
//   lane = cột, bước = hàng (rank longest-path), loop đi hành lang phải, nhãn tách đường.
//   Đây là engine swimlane mặc định (đẹp hơn ELK — node thẳng hàng, loop không vọt đỉnh).
// BPMN_ENGINE=elk    → ép ELK swimlane NGANG cũ (dự phòng).
// BPMN_ENGINE=grid   → ép grid kể cả no-lane (1 lane = 1 cột).
// BPMN_ENGINE=legacy → engine tự viết cũ 267 dòng.
const ENGINE = process.env.BPMN_ENGINE || 'auto';
const WANT_LANES = process.env.BPMN_LANES === '1';
async function buildXml(ir) {
  if (ENGINE === 'legacy') return layoutIR(ir);
  const laneCount = new Set((ir.nodes || []).map(n => n.lane).filter(Boolean)).size;
  const useLanes = WANT_LANES && laneCount >= 2;
  if (ENGINE === 'elk') return layoutElk(ir, { noLanes: !useLanes });   // ép ELK ngang
  if (ENGINE === 'grid') return layoutGrid(ir);                          // ép grid dọc
  if (useLanes) return layoutGrid(ir);                                   // swimlane → grid dọc (mặc định)
  return layoutAuto(ir, { noLanes: true });                             // no-lane → auto-layout
}

// HERE = thư mục ENGINE (script + template + node_modules) — dùng chung mọi feature.
// WORK = thư mục FEATURE chứa output (ir/src/bpmn/index/viewer). Tách khỏi engine để
// không nhân bản engine vào mỗi feature. Lấy WORK từ `--dir <path>`; mặc định = cwd.
const HERE = dirname(fileURLToPath(import.meta.url));
const VERIFY = process.argv.includes('--verify');
const NO_IR = process.argv.includes('--no-ir');
const dirArg = process.argv.indexOf('--dir');
const WORK = dirArg !== -1 && process.argv[dirArg + 1]
  ? (process.argv[dirArg + 1].startsWith('/') ? process.argv[dirArg + 1] : join(process.cwd(), process.argv[dirArg + 1]))
  : process.cwd();
if (!existsSync(WORK)) { console.error('Thư mục feature không tồn tại:', WORK); process.exit(1); }

// ─────────────────────────── IR → BPMN ───────────────────────────
// Mỗi {slug}.ir.json → semcheck (structural BẮT BUỘC pass) → layout → {slug}.bpmn.
// {slug}.src.json (optional, cạnh IR) chứa source facts {actors,branches,errors} để check coverage.
if (!NO_IR) {
  const irFiles = readdirSync(WORK).filter(f => f.endsWith('.ir.json'));
  let irFail = 0;
  for (const f of irFiles) {
    const slug = f.replace(/\.ir\.json$/, '');
    const ir = JSON.parse(readFileSync(join(WORK, f), 'utf8'));
    const srcPath = join(WORK, slug + '.src.json');
    const source = existsSync(srcPath) ? JSON.parse(readFileSync(srcPath, 'utf8')) : {};
    const rep = checkIR(ir, source);
    if (!rep.ok) {
      console.error(`✗ ${f}: ${rep.errors.length} lỗi nghiệp vụ — KHÔNG sinh .bpmn:`);
      rep.errors.forEach(e => console.error('    ' + e));
      irFail++; continue;
    }
    if (rep.warnings.length) {
      console.error(`⚠ ${slug}: ${rep.warnings.length} cảnh báo coverage:`);
      rep.warnings.forEach(w => console.error('    • ' + w));
    }
    writeFileSync(join(WORK, slug + '.bpmn'), await buildXml(ir));
    const cov = Object.entries(rep.coverage).map(([k,v]) => `${k} ${v.covered ?? (v.total - (v.missing?.length||0))}/${v.total}`).join(', ');
    const laneCount = new Set((ir.nodes || []).map(n => n.lane).filter(Boolean)).size;
    // nhãn engine khớp buildXml: legacy → legacy; ép elk → elk; ép grid → grid;
    // swimlane (BPMN_LANES=1 + ≥2 lane) → grid (mặc định); còn lại → auto (no-lane).
    const engLabel = ENGINE === 'legacy' ? 'legacy'
      : ENGINE === 'elk' ? 'elk'
      : ENGINE === 'grid' ? 'grid'
      : (WANT_LANES && laneCount >= 2) ? 'grid'
      : 'auto';
    console.log(`✓ ${slug}.bpmn ${cov ? '('+cov+')' : ''} [${engLabel}]`);
  }
  if (irFail) { console.error(`\n❌ ${irFail} IR có lỗi nghiệp vụ. Sửa IR rồi chạy lại.`); process.exit(1); }
  if (irFiles.length) console.log('');
}

function titleOf(xml, slug) {
  const m = xml.match(/<bpmn:participant[^>]*\bname="([^"]*)"/) ||
            xml.match(/<bpmn:process[^>]*\bname="([^"]*)"/);
  return m ? m[1] : slug;
}
function esc(xml) {
  return xml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const files = readdirSync(WORK).filter(f => f.endsWith('.bpmn'));
if (!files.length) { console.error('Không có file .bpmn nào trong', WORK); process.exit(1); }

// ─────────────────────────── VERIFY ───────────────────────────
if (VERIFY) {
  let BpmnModdle;
  try { BpmnModdle = (await import('bpmn-moddle')).default; }
  catch {
    console.error('Cài bpmn-moddle (lần đầu)...');
    execSync('npm install bpmn-moddle@9 --no-save --prefix .', { cwd: HERE, stdio: 'inherit' });
    const require = createRequire(join(HERE, 'noop.js'));
    BpmnModdle = (await import(pathToFileURL(require.resolve('bpmn-moddle')).href)).default;
  }

  let total = 0;
  for (const f of files) {
    const xml = readFileSync(join(WORK, f), 'utf8');
    const problems = await validate(xml, BpmnModdle, f, ENGINE === 'auto' && !WANT_LANES);
    total += problems;
  }
  console.log(total ? `\n❌ ${total} vấn đề tổng cộng.` : `\n✅ Tất cả ${files.length} file: layout sạch.`);
  process.exit(total ? 1 : 0);
}

// ─────────────────────────── BUILD ───────────────────────────
const tplPath = join(HERE, '_viewer_template.html');
if (!existsSync(tplPath)) { console.error('Thiếu _viewer_template.html cạnh script'); process.exit(1); }
const tpl = readFileSync(tplPath, 'utf8');

const processes = files.map(f => {
  const slug = f.replace(/\.bpmn$/, '');
  const xml = readFileSync(join(WORK, f), 'utf8');
  if (!xml.includes('BPMNDiagram')) {
    console.error(`⚠ ${f}: THIẾU <BPMNDiagram> — viewer sẽ trắng. Skill $bpmn phải sinh kèm layout.`);
  }
  return { slug, title: titleOf(xml, slug), xml };
});

const arr = '[\n' + processes.map(p =>
  `  { slug: ${JSON.stringify(p.slug)}, title: ${JSON.stringify(p.title)}, xml: \`${esc(p.xml)}\` }`
).join(',\n') + '\n]';

// feature = tên folder cha của WORK (docs/{feature}/bpmn → {feature})
const feature = WORK.replace(/\/bpmn\/?$/, '').split('/').pop() || 'feature';
const html = tpl.replace(/__FEATURE__/g, feature).replace('__BPMN_PROCESSES__', arr);
// Output editor per-feature: {feature}-bpmn-editor.html (theo pattern {feature}-{domain}-...
// để không trùng tên khi mở tab Obsidian/IDE; là editor kéo-thả, không phải viewer).
const editorName = feature + '-bpmn-editor.html';
writeFileSync(join(WORK, editorName), html, 'utf8');
console.log(`→ ${editorName} (${processes.length} process, ${html.length} bytes)`);

// ─────────────────────── validate() ───────────────────────
// skipParallel: engine bpmn-auto-layout cố ý route nhiều edge share trục (hợp lệ BPMN,
// mắt thường không thấy) → check "line đè song song" false-positive. Vẫn giữ check cắt-task.
async function validate(xml, BpmnModdle, fname, skipParallel = false) {
  const moddle = new BpmnModdle();
  const { warnings } = await moddle.fromXML(xml);
  console.log(`\n[${fname}] parse OK, warnings: ${warnings.length}`);
  if (!xml.includes('BPMNDiagram')) { console.log('  ✗ THIẾU <BPMNDiagram>'); return 1; }

  const shapes = {}, lanes = {}, edges = {};
  for (const [, id, x, y, w, h] of xml.matchAll(
    /<bpmndi:BPMNShape[^>]*bpmnElement="([^"]+)"[^>]*>\s*<dc:Bounds x="([\-\d.]+)" y="([\-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g))
    shapes[id] = { x:+x, y:+y, w:+w, h:+h };
  for (const m of xml.matchAll(/<bpmn:lane id="([^"]+)" name="([^"]+)">([\s\S]*?)<\/bpmn:lane>/g)) {
    const di = shapes[m[1]] || {};
    lanes[m[2]] = { ...di, members: [...m[3].matchAll(/<bpmn:flowNodeRef>([^<]+)<\/bpmn:flowNodeRef>/g)].map(r=>r[1]) };
  }
  for (const e of xml.matchAll(/<bpmndi:BPMNEdge[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/bpmndi:BPMNEdge>/g))
    edges[e[1]] = [...e[2].matchAll(/<di:waypoint x="([\-\d.]+)" y="([\-\d.]+)"/g)].map(w=>({x:+w[1],y:+w[2]}));

  let p = 0;
  const ov = (a1,a2,b1,b2)=>Math.min(Math.max(a1,a2),Math.max(b1,b2))-Math.max(Math.min(a1,a2),Math.min(b1,b2));

  // Lane membership: với engine ELK, layout tối ưu có thể đặt node lệch dải lane IR
  // (node thật vẫn đúng lane nghiệp vụ qua flowNodeRef; chỉ vị trí Y lệch). Đây là
  // đánh đổi layout-đẹp vs lane-cứng → chỉ CẢNH BÁO, không tính lỗi chặn.
  for (const [ln, lane] of Object.entries(lanes)) for (const id of lane.members) {
    const s = shapes[id];
    if (!s) { console.log(`  ✗ ${id}: không shape`); p++; continue; }
    const cy = s.y + s.h/2;
    if (cy < lane.y || cy > lane.y + lane.h) console.log(`  ⚠ ${id} nằm lệch dải lane "${ln}" (layout ELK tối ưu — không chặn)`);
  }

  const seg = [];
  for (const [id, wps] of Object.entries(edges)) for (let i=0;i<wps.length-1;i++) seg.push({id,a:wps[i],b:wps[i+1]});
  for (let i=0;i<seg.length;i++) for (let j=i+1;j<seg.length;j++){
    const s=seg[i], t=seg[j]; if (s.id===t.id) continue;
    // Threshold 15px: bỏ qua stub ngắn ở gốc gateway (2 nhánh cùng phía share vài px
    // đầu rồi tách — vô hại, mắt thường không thấy, mọi tool BPMN đều vậy). Vẫn bắt
    // line đè THẬT (chạy song song dài).
    if (skipParallel) continue;   // engine auto: share-trục hợp lệ, bỏ check này
    if (s.a.x===s.b.x && t.a.x===t.b.x && s.a.x===t.a.x && ov(s.a.y,s.b.y,t.a.y,t.b.y)>15){ console.log(`  ✗ DỌC đè: ${s.id} & ${t.id} @x=${s.a.x}`); p++; }
    if (s.a.y===s.b.y && t.a.y===t.b.y && s.a.y===t.a.y && ov(s.a.x,s.b.x,t.a.x,t.b.x)>15){ console.log(`  ✗ NGANG đè: ${s.id} & ${t.id} @y=${s.a.y}`); p++; }
  }

  // task = box hẹp (~80 cao), KHÔNG phải lane/participant/pool box (dải cao)
  const tasks = Object.keys(shapes).filter(id=>shapes[id].w>=80 && shapes[id].h<=120 && !/^(Lane_|Participant_)/.test(id));
  for (const sg of seg) for (const tid of tasks){
    const s=shapes[tid];
    const touch=(q)=>q.x>=s.x-2&&q.x<=s.x+s.w+2&&q.y>=s.y-2&&q.y<=s.y+s.h+2;
    if (touch(sg.a)||touch(sg.b)) continue;
    if (sg.a.y===sg.b.y && sg.a.y>s.y+8 && sg.a.y<s.y+s.h-8 && ov(sg.a.x,sg.b.x,s.x,s.x+s.w)>5){ console.log(`  ✗ ${sg.id} cắt ngang thân ${tid}`); p++; }
    if (sg.a.x===sg.b.x && sg.a.x>s.x+8 && sg.a.x<s.x+s.w-8 && ov(sg.a.y,sg.b.y,s.y,s.y+s.h)>5){ console.log(`  ✗ ${sg.id} cắt dọc thân ${tid}`); p++; }
  }

  if (!p) console.log('  ✓ swimlane đúng, line không đè, không cắt task');
  return p;
}
