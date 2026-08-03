// bpmn-layout-auto.mjs — Engine layout BPMN dùng bpmn-auto-layout (bpmn-io chính chủ).
// IR { process, nodes[], flows[] } → BPMN semantic THUẦN → layoutProcess() sinh DI sạch.
//
// Vì sao đổi từ ELK-tự-vá: ELK/tự-route đã đẹp, NHƯNG chồng thêm clip/dogleg/group-track
// tự viết lên → phá routing, tạo khúc bẻ "tréo tréo". Research (bpmn.io) xác nhận:
// "the library routes its own edges, adding routing on top is redundant" + orthogonal
// output "display-ready without alteration". → để thư viện chính chủ lo TRỌN layout.
//
// Kết quả: routing sạch như vẽ tay, gateway có ký hiệu X chuẩn OMG, loop-back đi vòng đẹp.
// Hạn chế bpmn-auto-layout: KHÔNG swimlane (chỉ layout participant đầu). Với $bpmn mặc định
// no-lane → không sao. Cần lane → dùng bpmn-layout-elk.mjs (BPMN_ENGINE=elk).
import { layoutProcess } from 'bpmn-auto-layout';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bpmnTag = k => ({ start: 'startEvent', end: 'endEvent', gateway: 'exclusiveGateway', task: 'task' }[k] || 'task');

// Fix (codex #1): BPMN id phải là NCName (không space, không bắt đầu bằng số).
// ID lỗi → bpmn-moddle BỎ node silently khi parse → mất node/flow. Sanitize về NCName
// + đảm bảo unique (id trùng → BPMNEdge trùng bpmnElement). Trả map id-gốc → id-sạch.
function buildIdMap(ir) {
  const map = {}, used = new Set();
  const clean = raw => {
    let s = String(raw ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
    if (!s || /^[^A-Za-z_]/.test(s)) s = '_' + s;      // NCName phải bắt đầu letter/_
    let u = s, i = 1;
    while (used.has(u)) u = s + '_' + (i++);            // dedupe
    used.add(u); return u;
  };
  map[ir.process.id] = clean(ir.process.id);
  for (const n of ir.nodes) if (map[n.id] == null) map[n.id] = clean(n.id);
  for (const f of ir.flows) if (map[f.id] == null) map[f.id] = clean(f.id);
  return map;
}

// ── 1. IR → BPMN semantic thuần (KHÔNG toạ độ; layoutProcess sẽ sinh <BPMNDiagram>) ──
function irToSemantic(ir, idMap) {
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  const id = x => esc(idMap[x] ?? x);
  let els = '';
  for (const n of ir.nodes) {
    const inc = ir.flows.filter(f => f.tgt === n.id && nodeIds.has(f.src)).map(f => `<bpmn:incoming>${id(f.id)}</bpmn:incoming>`).join('');
    const out = ir.flows.filter(f => f.src === n.id && nodeIds.has(f.tgt)).map(f => `<bpmn:outgoing>${id(f.id)}</bpmn:outgoing>`).join('');
    els += `    <bpmn:${bpmnTag(n.kind)} id="${id(n.id)}" name="${esc(n.name)}">${inc}${out}</bpmn:${bpmnTag(n.kind)}>\n`;
  }
  for (const f of ir.flows) {
    // bỏ flow trỏ node không tồn tại (tránh layoutProcess lỗi)
    if (!nodeIds.has(f.src) || !nodeIds.has(f.tgt)) continue;
    els += `    <bpmn:sequenceFlow id="${id(f.id)}" name="${esc(f.name)}" sourceRef="${id(f.src)}" targetRef="${id(f.tgt)}"/>\n`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Def_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${id(ir.process.id)}" isExecutable="false">
${els}  </bpmn:process>
</bpmn:definitions>`;
}

// ── 2. Chèn BPMNLabel với vị trí tránh đè ──
// bpmn-auto-layout KHÔNG sinh <BPMNLabel> → bpmn-js tự đặt label ở midpoint edge lúc
// render → chồng lên tên gateway/node khi layout khít. Ta TỰ chèn <BPMNLabel bounds="">
// tại vị trí trống (bpmn-js tôn trọng bounds nếu có). Giữ nguyên waypoint (routing sạch).
function addEdgeLabels(xml, flowNames) {
  // gom shape bounds + tên flow để tính vùng cấm và text
  const shapes = [];
  const shapeRe = /<bpmndi:BPMNShape\b[^>]*bpmnElement="([^"]+)"[^>]*>\s*<dc:Bounds x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g;
  let m;
  while ((m = shapeRe.exec(xml))) shapes.push({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
  // vùng cấm = node + dải label tên node bên dưới event/gateway (shape nhỏ)
  const forbidden = shapes.map(s => (s.w <= 60 && s.h <= 60)
    ? { x: s.x - 36, y: s.y, w: s.w + 72, h: s.h + 32 }
    : { x: s.x - 2, y: s.y - 2, w: s.w + 4, h: s.h + 4 });
  const placed = [];
  const hit = (b, q) => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y;
  const free = (b) => !forbidden.some(q => hit(b, q)) && !placed.some(q => hit(b, q));

  // với mỗi edge có tên nhưng CHƯA có BPMNLabel → chèn label ở midpoint, né đè
  return xml.replace(/<bpmndi:BPMNEdge\b[^>]*bpmnElement="([^"]+)"[^>]*>([\s\S]*?)<\/bpmndi:BPMNEdge>/g,
    (whole, id, inner) => {
      const name = flowNames[id];
      if (!name || inner.includes('BPMNLabel')) return whole;
      const wps = [...inner.matchAll(/<di:waypoint x="([-\d.]+)" y="([-\d.]+)"/g)].map(w => [+w[1], +w[2]]);
      if (wps.length < 2) return whole;
      const midSeg = wps[Math.floor(wps.length / 2) - 1] && wps[Math.floor(wps.length / 2)]
        ? [wps[Math.floor(wps.length / 2) - 1], wps[Math.floor(wps.length / 2)]] : [wps[0], wps[1]];
      const mx = (midSeg[0][0] + midSeg[1][0]) / 2, my = (midSeg[0][1] + midSeg[1][1]) / 2;
      const lw = Math.min(Math.max(name.length * 6, 24), 150), lh = 14;
      // nhiều candidate quanh midpoint (trên/dưới/lệch trái-phải, xa dần)
      const cands = [[mx - lw / 2, my - lh - 6], [mx - lw / 2, my + 6], [mx - lw / 2, my - lh - 22],
                     [mx - lw / 2, my + 22], [mx - lw / 2 - lw / 2, my - lh - 6], [mx + 6, my - lh - 6],
                     [mx - lw / 2, my - lh - 40], [mx - lw / 2, my + 40],
                     [mx - lw / 2 - lw, my - lh - 6], [mx + lw, my - lh - 6],
                     [mx - lw / 2, my - lh - 58], [mx - lw / 2, my + 58]];
      // Fix (codex #2): chọn candidate FREE đầu tiên; nếu không có → chọn cái đè ÍT NHẤT
      // (diện tích overlap nhỏ nhất) thay vì mặc định candidate[0] (có thể đè nặng).
      const areaOverlap = (b) => {
        let a = 0;
        for (const q of [...forbidden, ...placed]) {
          const ox = Math.max(0, Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x));
          const oy = Math.max(0, Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y));
          a += ox * oy;
        }
        return a;
      };
      let bx, by, best = Infinity;
      for (const [cx, cy] of cands) {
        const b = { x: cx, y: cy, w: lw, h: lh };
        if (free(b)) { bx = cx; by = cy; best = 0; break; }
        const a = areaOverlap(b);
        if (a < best) { best = a; bx = cx; by = cy; }
      }
      placed.push({ x: bx, y: by, w: lw, h: lh });
      const label = `\n        <bpmndi:BPMNLabel>\n          <dc:Bounds x="${Math.round(bx)}" y="${Math.round(by)}" width="${Math.round(lw)}" height="${lh}" />\n        </bpmndi:BPMNLabel>\n      `;
      return whole.replace('</bpmndi:BPMNEdge>', label + '</bpmndi:BPMNEdge>');
    });
}

// ── API chính (giữ signature như engine cũ) ──
export async function layoutToBpmn(ir, opts = {}) {
  // noLanes bị bỏ qua ở đây — bpmn-auto-layout luôn no-lane. Caller muốn lane → dùng ELK.
  const idMap = buildIdMap(ir);                       // Fix #1: id → NCName unique
  const semantic = irToSemantic(ir, idMap);
  const laidOut = await layoutProcess(semantic);
  // Fix (codex #3): layoutProcess không throw khi semantic thiếu node do id lỗi. Kiểm
  // mọi node/flow (id đã sanitize) có mặt trong DI; thiếu → cảnh báo (không nuốt lặng lẽo).
  const nodeIdsClean = new Set(ir.nodes.map(n => idMap[n.id]));
  for (const id of nodeIdsClean) {
    if (!laidOut.includes(`bpmnElement="${id}"`)) console.warn(`⚠ bpmn-auto-layout bỏ node "${id}" — kiểm IR (id trùng/lỗi?)`);
  }
  const flowNames = {};
  for (const f of ir.flows) if (f.name) flowNames[idMap[f.id]] = f.name;
  return addEdgeLabels(laidOut, flowNames);
}
