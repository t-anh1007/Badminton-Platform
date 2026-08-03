// bpmn-layout-elk.mjs — Engine layout BPMN dùng ELK (thay bpmn-layout.mjs tự viết).
// IR { process, lanes[], nodes[], flows[] } → BPMN 2.0 XML (semantic + BPMNDiagram).
//
// Vì sao ELK: engine tự viết cũ route back-edge bằng cách vọt lên đỉnh canvas → lộn xộn.
// ELK (Sugiyama layered) tính toạ độ + routing chuẩn. Ta chỉ khai báo cấu trúc.
//
// Kế thừa kỹ thuật từ Stieges/bpmn-generator (MIT):
//   1. partitioning → swimlane (node cùng lane vào cùng dải, ELK lo X/Y)
//   2. wrapping MULTI_EDGE → giảm chéo khi nhiều cạnh
//   3. topo-sort + order lanes by flow → happy path chạy trái→phải, ít nhảy chéo
//   4. orthogonal endpoint clipping → mũi tên cắm đúng biên circle/diamond/rect
//
// lanes optional: IR không có lanes (hoặc noLanes=true) → layout phẳng, không swimlane.
import ELK from 'elkjs/lib/elk.bundled.js';

const SIZE = { start: [36, 36], end: [36, 36], gateway: [50, 50], task: [120, 70] };
const dim = k => SIZE[k] || SIZE.task;

const LANE_HEADER_W = 30;   // chỗ chừa cho tên lane (dọc bên trái)
const LANE_PADDING = 24;
const POOL_MARGIN = 20;

// ── Topological order + order lanes theo dòng chảy ──
// Sắp node theo thứ tự flow (BFS từ start) để ELK ưu tiên happy path.
// Trả về: nodes đã sort, lanes đã order theo lần xuất hiện đầu tiên trong flow.
function orderByFlow(ir) {
  const adj = {};
  ir.nodes.forEach(n => { adj[n.id] = []; });
  ir.flows.forEach(f => { (adj[f.src] ||= []).push(f.tgt); });
  const starts = ir.nodes.filter(n => n.kind === 'start').map(n => n.id);
  const seedIds = starts.length ? starts : (ir.nodes[0] ? [ir.nodes[0].id] : []);
  const seen = new Set(), order = [];
  const q = [...seedIds];
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id); order.push(id);
    for (const t of (adj[id] || [])) if (!seen.has(t)) q.push(t);
  }
  // node không reachable (mồ côi) vẫn giữ lại cuối
  for (const n of ir.nodes) if (!seen.has(n.id)) order.push(n.id);
  const nodeById = Object.fromEntries(ir.nodes.map(n => [n.id, n]));
  // Fix (codex #3): flow có thể trỏ tới id không tồn tại trong nodes[] → order
  // chứa id rác. Lọc bỏ, chỉ giữ node thật (tránh undefined khi deref sau).
  const sortedNodes = order.map(id => nodeById[id]).filter(Boolean);

  // order lanes theo lần đầu 1 node của lane xuất hiện trong flow order
  const laneFirstSeen = {};
  sortedNodes.forEach((n, i) => { if (n.lane != null && laneFirstSeen[n.lane] == null) laneFirstSeen[n.lane] = i; });
  const orderedLanes = [...(ir.lanes || [])].sort(
    (a, b) => (laneFirstSeen[a.id] ?? 1e9) - (laneFirstSeen[b.id] ?? 1e9)
  );
  return { sortedNodes, orderedLanes };
}

// ── ELK layout ──
async function runElk(ir, sortedNodes, orderedLanes, noLanes) {
  const elk = new ELK();
  // Fix (codex #2 mở rộng): ELK partitioning yêu cầu partition index LIÊN TỤC từ 0.
  // Lane rỗng (không node nào) tạo "lỗ" trong dãy → ELK ném "must not be negative".
  // → chỉ partition theo lane THỰC SỰ có node, re-index liên tục.
  const lanesWithNodes = orderedLanes.filter(L => sortedNodes.some(n => n.lane === L.id));
  const useLanes = !noLanes && lanesWithNodes.length > 0;
  const lanePart = {};
  lanesWithNodes.forEach((l, i) => { lanePart[l.id] = i; });

  const children = sortedNodes.map(n => {
    const [w, h] = dim(n.kind);
    const lo = {};
    if (useLanes && lanePart[n.lane] != null) lo['elk.partitioning.partition'] = String(lanePart[n.lane]);
    return { id: n.id, width: w, height: h, layoutOptions: lo };
  });
  // Fix (codex #3 mở rộng): ELK ném lỗi nếu edge trỏ tới node không có trong children.
  // Lọc flow rác (src/tgt không phải node thật) TRƯỚC khi đưa vào ELK.
  const nodeIdSet = new Set(sortedNodes.map(n => n.id));
  const edges = ir.flows
    .filter(f => nodeIdSet.has(f.src) && nodeIdSet.has(f.tgt))
    .map(f => ({ id: f.id, sources: [f.src], targets: [f.tgt] }));

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.partitioning.activate': useLanes ? 'true' : 'false',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.spacing.nodeNode': '50',
      'elk.spacing.edgeNode': '25',
      'elk.layered.wrapping.strategy': 'MULTI_EDGE',
      'elk.layered.wrapping.additionalEdgeSpacing': '40',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.padding': `[top=${LANE_PADDING},left=${LANE_PADDING + (useLanes ? LANE_HEADER_W : 0)},bottom=${LANE_PADDING},right=${LANE_PADDING}]`,
    },
    children, edges,
  };
  const laid = await elk.layout(graph);
  return { laid, useLanes, lanePart };
}

// ── Orthogonal endpoint clipping (theo ĐÚNG hình học từng shape) ──
// Mũi tên phải "dính" vào biên node như draw.io. ELK route tới tâm; ta cắt điểm cuối
// vào biên thật. QUAN TRỌNG: gateway là HÌNH THOI (diamond) — cạnh nghiêng, chỉ chạm
// bounding-box ở 4 đỉnh giữa cạnh. Cắt như rect → mũi tên hở ra ngoài (bug bạn thấy).
// Với diamond ta CHỐT điểm cắm về đúng đỉnh nhọn theo hướng vào; với rect/circle cắt mép.
function clipToShape(shape, kind, endPt, prevPt) {
  const cx = shape.x + shape.w / 2, cy = shape.y + shape.h / 2;
  const x0 = shape.x, y0 = shape.y, x1 = shape.x + shape.w, y1 = shape.y + shape.h;
  const [ex, ey] = endPt, [px, py] = prevPt;
  const horiz = Math.abs(ex - px) >= Math.abs(ey - py);
  const dir = horiz ? Math.sign(ex - px || cx - px) : Math.sign(ey - py || cy - py);

  if (kind === 'gateway') {
    // Diamond: 4 đỉnh ở (cx,y0)(cx,y1)(x0,cy)(x1,cy). Mũi tên orthogonal cắm thẳng
    // vào đỉnh nhọn theo hướng vào → luôn "dính" chuẩn, không hở.
    if (horiz) return dir >= 0 ? [x0, cy] : [x1, cy];   // vào từ trái/phải → đỉnh trái/phải
    return dir >= 0 ? [cx, y0] : [cx, y1];              // vào từ trên/dưới → đỉnh trên/dưới
  }
  if (kind === 'start' || kind === 'end') {
    // Circle: cắm vào điểm trên vòng theo trục chính (giữ orthogonal → dùng tâm trục kia).
    const r = Math.min(shape.w, shape.h) / 2;
    if (horiz) return dir >= 0 ? [cx - r, cy] : [cx + r, cy];
    return dir >= 0 ? [cx, cy - r] : [cx, cy + r];
  }
  // rect (task): cắt vào mép, giữ toạ độ trục vuông góc (kẹp trong node để không lệch ra).
  if (horiz) { const yy = Math.min(Math.max(ey, y0 + 4), y1 - 4); return dir >= 0 ? [x0, yy] : [x1, yy]; }
  const xx = Math.min(Math.max(ex, x0 + 4), x1 - 4);
  return dir >= 0 ? [xx, y0] : [xx, y1];
}

// Chọn đỉnh RA của gateway (diamond) theo hướng tới target (dx,dy = target - gateway).
// Fan-out: mỗi nhánh dùng đỉnh theo phương trội của hướng → 2 nhánh khác hướng ra 2
// đỉnh khác nhau, không trùng stub. Ngang trội → đỉnh trái/phải; dọc trội → trên/dưới.
function gatewayExitVertex(shape, dx, dy) {
  const cx = shape.x + shape.w / 2, cy = shape.y + shape.h / 2;
  const x0 = shape.x, y0 = shape.y, x1 = shape.x + shape.w, y1 = shape.y + shape.h;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? [x1, cy] : [x0, cy];  // phải/trái
  return dy >= 0 ? [cx, y1] : [cx, y0];                                     // dưới/trên
}

// Chèn điểm bẻ góc L để đoạn từ `neighbor` tới điểm cắm `clip` vuông góc.
// clip nằm trên biên node (đỉnh diamond / mép circle). Nếu neighbor không thẳng
// hàng ngang/dọc với clip → thêm 1 điểm sao cho đoạn cuối chạm node theo trục.
// Điểm cắm ở cạnh trái/phải (x cố định) → elbow = (clip.x, neighbor.y): đi dọc rồi ngang.
// Điểm cắm ở cạnh trên/dưới (y cố định) → elbow = (neighbor.x, clip.y): đi ngang rồi dọc.
function orthoElbow(clip, neighbor) {
  const [cx, cy] = clip, [nx, ny] = neighbor;
  if (Math.abs(cx - nx) < 1 || Math.abs(cy - ny) < 1) return null; // đã thẳng hàng
  // đoạn cuối chạm node theo phương ngang khi |Δx|>|Δy| ở đoạn tiến vào
  // → giữ y = cy cho đoạn ngang cuối: elbow tại (nx, cy)
  return [nx, cy];
}

// ── Post-routing: khử overlap segment giữa các edge ──
// Gom segment cùng phương/cùng trục thành overlap group, rồi cấp track 1 lần cho
// cả group. Segment giữa được dịch nguyên đoạn; segment đầu/cuối dùng dogleg để
// giữ anchor vẫn cắm đúng biên node.
const OVERLAP_TRACK = 12;   // bước dịch
const OVERLAP_MIN = 16;     // chồng > ngần này mới xử (bỏ stub ngắn vô hại)
const ENDPOINT_STUB = 10;   // stub ngắn rời node trước khi jog sang track riêng
const EPS = 0.5;
const ovLen = (a1, a2, b1, b2) => Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));
const trackOffset = slot => {
  if (slot === 0) return 0;
  const step = Math.ceil(slot / 2);
  return (slot % 2 ? -1 : 1) * step * OVERLAP_TRACK;
};
const segKey = s => `${s.edgeId}:${s.i}`;

function collectSegments(edgeWps) {
  const refs = [];
  for (const [edgeId, pts] of Object.entries(edgeWps)) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const horiz = Math.abs(a[1] - b[1]) < EPS;
      const vert = Math.abs(a[0] - b[0]) < EPS;
      if (!horiz && !vert) continue;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS) continue;
      const orient = horiz ? 'h' : 'v';
      const axis = horiz ? a[1] : a[0];
      const p1 = horiz ? a[0] : a[1];
      const p2 = horiz ? b[0] : b[1];
      refs.push({
        edgeId, i, orient,
        axis, axisKey: Math.round(axis),
        from: Math.min(p1, p2),
        to: Math.max(p1, p2),
        endpoint: i === 0 ? 'start' : (i === pts.length - 2 ? 'end' : 'mid'),
      });
    }
  }
  return refs;
}

function overlapGroups(edgeWps) {
  const byLine = new Map();
  for (const s of collectSegments(edgeWps)) {
    const key = `${s.orient}:${s.axisKey}`;
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(s);
  }

  const groups = [];
  for (const line of byLine.values()) {
    const n = line.length;
    if (n < 2) continue;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (line[i].edgeId === line[j].edgeId) continue;
      if (ovLen(line[i].from, line[i].to, line[j].from, line[j].to) > OVERLAP_MIN) union(i, j);
    }
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!buckets.has(root)) buckets.set(root, []);
      buckets.get(root).push(line[i]);
    }
    for (const g of buckets.values()) {
      const edgeCount = new Set(g.map(s => s.edgeId)).size;
      if (edgeCount > 1) groups.push(g);
    }
  }
  return groups;
}

function assignTrackOffsets(groups) {
  const offsets = new Map();
  for (const group of groups) {
    const ordered = [...group].sort((a, b) =>
      a.from - b.from || a.to - b.to || a.edgeId.localeCompare(b.edgeId) || a.i - b.i
    );
    ordered.forEach((s, slot) => {
      const off = trackOffset(slot);
      if (!off) return;
      const key = segKey(s);
      const prev = offsets.get(key);
      if (prev == null || Math.abs(off) > Math.abs(prev.offset)) offsets.set(key, { ...s, offset: off });
    });
  }
  return [...offsets.values()];
}

function shiftMiddleSegment(pts, i, orient, offset) {
  if (orient === 'h') {
    pts[i][1] += offset;
    pts[i + 1][1] += offset;
  } else {
    pts[i][0] += offset;
    pts[i + 1][0] += offset;
  }
}

function doglegEndpoint(pts, i, orient, offset) {
  if (!offset) return;
  const isStart = i === 0;
  const a = pts[i], b = pts[i + 1];
  if (isStart) {
    if (orient === 'h') {
      const dir = Math.sign(b[0] - a[0]) || 1;
      const stubLen = Math.min(ENDPOINT_STUB, Math.max(4, Math.abs(b[0] - a[0]) / 2));
      const stub = [a[0] + dir * stubLen, a[1]];
      const jog = [stub[0], a[1] + offset];
      b[1] += offset;
      pts.splice(1, 0, stub, jog);
    } else {
      const dir = Math.sign(b[1] - a[1]) || 1;
      const stubLen = Math.min(ENDPOINT_STUB, Math.max(4, Math.abs(b[1] - a[1]) / 2));
      const stub = [a[0], a[1] + dir * stubLen];
      const jog = [a[0] + offset, stub[1]];
      b[0] += offset;
      pts.splice(1, 0, stub, jog);
    }
  } else {
    if (orient === 'h') {
      const dir = Math.sign(a[0] - b[0]) || -1;
      const stubLen = Math.min(ENDPOINT_STUB, Math.max(4, Math.abs(b[0] - a[0]) / 2));
      const stub = [b[0] + dir * stubLen, b[1]];
      const jog = [stub[0], b[1] + offset];
      a[1] += offset;
      pts.splice(i + 1, 0, jog, stub);
    } else {
      const dir = Math.sign(a[1] - b[1]) || -1;
      const stubLen = Math.min(ENDPOINT_STUB, Math.max(4, Math.abs(b[1] - a[1]) / 2));
      const stub = [b[0], b[1] + dir * stubLen];
      const jog = [b[0] + offset, stub[1]];
      a[0] += offset;
      pts.splice(i + 1, 0, jog, stub);
    }
  }
}

function applyTrackOffset(edgeWps, s) {
  const pts = edgeWps[s.edgeId];
  if (!pts || s.i >= pts.length - 1) return;
  if (s.endpoint === 'mid') shiftMiddleSegment(pts, s.i, s.orient, s.offset);
  else doglegEndpoint(pts, s.i, s.orient, s.offset);
}

function normalizeWaypoints(pts) {
  for (let i = pts.length - 2; i >= 0; i--) {
    if (Math.abs(pts[i][0] - pts[i + 1][0]) < EPS && Math.abs(pts[i][1] - pts[i + 1][1]) < EPS) pts.splice(i + 1, 1);
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const sameH = Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - c[1]) < EPS;
    const sameV = Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - c[0]) < EPS;
    if (sameH || sameV) { pts.splice(i, 1); i--; }
  }
}

function deOverlapEdges(edgeWps) {
  for (let pass = 0; pass < 5; pass++) {
    const moves = assignTrackOffsets(overlapGroups(edgeWps));
    if (!moves.length) break;
    moves
      .sort((a, b) => a.edgeId.localeCompare(b.edgeId) || b.i - a.i)
      .forEach(m => applyTrackOffset(edgeWps, m));
    Object.values(edgeWps).forEach(normalizeWaypoints);
  }
}

// ── Đặt edge label tránh đè label khác + node ──
// Mặc định label ở giữa edge; nếu đè box đã đặt hoặc đè node → thử dịch lên/xuống.
function placeEdgeLabel(pts, text, placed, pos, kindById) {
  const w = Math.min(Math.max(text.length * 6, 24), 140), h = 14;
  const mid = pts[Math.floor(pts.length / 2)] || pts[0];
  const bx = mid[0] - w / 2, by = mid[1] - h - 4;   // mặc định phía trên điểm giữa
  // Vùng node để né: gồm cả LABEL TEXT của node. Với start/end/gateway tên hiển thị
  // BÊN DƯỚI shape (~28px, rộng hơn shape) → mở rộng box né xuống dưới.
  const nodeBoxes = [];
  for (const id in pos) {
    const s = pos[id]; const k = kindById && kindById[id];
    if (k === 'start' || k === 'end' || k === 'gateway') {
      nodeBoxes.push({ x: s.x - 30, y: s.y, w: s.w + 60, h: s.h + 30 }); // + dải label dưới
    } else {
      nodeBoxes.push({ x: s.x, y: s.y, w: s.w, h: s.h });
    }
  }
  const hit = (x, y, box) => x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y;
  const overlaps = (x, y) => placed.some(q => hit(x, y, q)) || nodeBoxes.some(b => hit(x, y, b));
  const cands = [[bx, by], [bx, mid[1] + 6], [bx, by - 16], [bx, mid[1] + 24],
                 [bx - w / 2 - 8, by], [bx + w / 2 + 8, by], [bx, by - 30], [bx, mid[1] + 40]];
  for (const [x, y] of cands) if (!overlaps(x, y)) return { x, y, w, h };
  return { x: bx, y: by, w, h };
}

// ── Build BPMN XML ──
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Fix (codex #5): id/ref cũng phải escape — quote hoặc < trong IR làm XML sai.
// BPMN id nên là NCName; ta escape để chí ít không vỡ XML (attribute injection).
const escId = s => esc(s);
const bpmnTag = k => ({ start: 'startEvent', end: 'endEvent', gateway: 'exclusiveGateway', task: 'task' }[k] || 'task');

export async function layoutToBpmn(ir, opts = {}) {
  const noLanes = !!opts.noLanes;
  const { sortedNodes, orderedLanes } = orderByFlow(ir);
  const { laid, useLanes } = await runElk(ir, sortedNodes, orderedLanes, noLanes);

  const kindById = Object.fromEntries(ir.nodes.map(n => [n.id, n.kind]));
  const pos = {};
  for (const c of laid.children) pos[c.id] = { x: c.x, y: c.y, w: c.width, h: c.height };

  // waypoint từ ELK sections + clip 2 đầu
  const wp = {};
  for (const e of (laid.edges || [])) {
    const pts = [];
    for (const s of (e.sections || [])) {
      pts.push([s.startPoint.x, s.startPoint.y]);
      for (const b of (s.bendPoints || [])) pts.push([b.x, b.y]);
      pts.push([s.endPoint.x, s.endPoint.y]);
    }
    wp[e.id] = pts;
  }

  const esrc = {}, etgt = {};
  ir.flows.forEach(f => { esrc[f.id] = f.src; etgt[f.id] = f.tgt; });

  let flowEls = '', shapes = '', diEdges = '';
  const nodeIds = new Set(ir.nodes.map(n => n.id));
  for (const n of ir.nodes) {
    const inc = ir.flows.filter(f => f.tgt === n.id).map(f => `<bpmn:incoming>${escId(f.id)}</bpmn:incoming>`).join('');
    const out = ir.flows.filter(f => f.src === n.id).map(f => `<bpmn:outgoing>${escId(f.id)}</bpmn:outgoing>`).join('');
    flowEls += `    <bpmn:${bpmnTag(n.kind)} id="${escId(n.id)}" name="${esc(n.name)}">${inc}${out}</bpmn:${bpmnTag(n.kind)}>\n`;
    const p = pos[n.id];
    if (p) shapes += `      <bpmndi:BPMNShape bpmnElement="${escId(n.id)}"><dc:Bounds x="${Math.round(p.x)}" y="${Math.round(p.y)}" width="${p.w}" height="${p.h}"/></bpmndi:BPMNShape>\n`;
  }
  // ── Pha A: tính waypoint mọi edge (clip + fan-out), CHƯA ghi XML ──
  const edgeWps = {};      // id → [[x,y],...]  (dùng cho khử-overlap + pool bounds)
  const validFlows = [];
  for (const f of ir.flows) {
    // Fix (codex #3): bỏ flow trỏ tới node không tồn tại (tránh crash + XML rác)
    if (!nodeIds.has(f.src) || !nodeIds.has(f.tgt)) continue;
    validFlows.push(f);
    flowEls += `    <bpmn:sequenceFlow id="${escId(f.id)}" name="${esc(f.name)}" sourceRef="${escId(f.src)}" targetRef="${escId(f.tgt)}"/>\n`;
    let pts = (wp[f.id] || []).map(p => [...p]);
    const sp = pos[f.src], tp = pos[f.tgt];
    if (!pts || pts.length < 2) {
      pts = [[sp.x + sp.w, sp.y + sp.h / 2], [tp.x, tp.y + tp.h / 2]];
    }
    // Source-side clip. GATEWAY fan-out theo hướng target (đích trên→đỉnh trên...).
    if (sp && kindById[f.src] === 'gateway' && tp) {
      const gcx = sp.x + sp.w / 2, gcy = sp.y + sp.h / 2;
      const tcx = tp.x + tp.w / 2, tcy = tp.y + tp.h / 2;
      const c = gatewayExitVertex(sp, tcx - gcx, tcy - gcy);
      const elbow = orthoElbow(c, pts[1]);
      pts[0] = c;
      if (elbow) pts.splice(1, 0, elbow);
    } else if (sp) {
      pts[0] = clipToShape(sp, kindById[f.src], pts[0], pts[1]);
    }
    // Target-side: luôn clip (mũi tên phải dính vào node đích).
    if (tp) {
      const last = pts.length - 1;
      const c = clipToShape(tp, kindById[f.tgt], pts[last], pts[last - 1]);
      const elbow = orthoElbow(c, pts[last - 1]);
      pts[last] = c;
      if (elbow) pts.splice(last, 0, elbow);
    }
    edgeWps[f.id] = pts;
  }

  // ── Pha B: khử overlap segment giữa các edge (dịch track) ──
  deOverlapEdges(edgeWps);

  // ── Pha C: ghi BPMNEdge XML + label tránh đè ──
  const labelBoxes = [];   // vùng label đã đặt, để né nhau
  for (const f of validFlows) {
    const pts = edgeWps[f.id];
    const w = pts.map(([x, y]) => `<di:waypoint x="${Math.round(x)}" y="${Math.round(y)}"/>`).join('');
    let labelXml = '';
    if (f.name) {
      const lb = placeEdgeLabel(pts, String(f.name), labelBoxes, pos, kindById);
      labelBoxes.push(lb);
      labelXml = `<bpmndi:BPMNLabel><dc:Bounds x="${Math.round(lb.x)}" y="${Math.round(lb.y)}" width="${Math.round(lb.w)}" height="${Math.round(lb.h)}"/></bpmndi:BPMNLabel>`;
    }
    diEdges += `      <bpmndi:BPMNEdge bpmnElement="${escId(f.id)}">${w}${labelXml}</bpmndi:BPMNEdge>\n`;
  }

  // lane set + pool DI (chỉ khi useLanes)
  let laneSet = '', poolDI = '', collab = '', planeEl = ir.process.id;
  if (useLanes) {
    const laneList = orderedLanes.map(L => {
      const refs = ir.nodes.filter(n => n.lane === L.id).map(n => `<bpmn:flowNodeRef>${escId(n.id)}</bpmn:flowNodeRef>`).join('');
      return `<bpmn:lane id="${escId(L.id)}" name="${esc(L.name)}">${refs}</bpmn:lane>`;
    }).join('\n        ');
    laneSet = `    <bpmn:laneSet id="LaneSet_1">\n        ${laneList}\n    </bpmn:laneSet>\n`;

    // Fix (codex #4): gộp cả waypoint vào tập điểm để pool/lane bao trọn edge,
    // không chỉ node. Back-edge/wrapped edge của ELK hay vượt ra ngoài node bounds.
    const allWpPts = Object.values(edgeWps).flat();
    const all = ir.nodes.map(n => ({ ...pos[n.id], lane: n.lane })).filter(p => p.x != null);
    const xsAll = [...all.map(p => p.x), ...all.map(p => p.x + p.w), ...allWpPts.map(p => p[0])];
    const minX = Math.min(...xsAll), maxX = Math.max(...xsAll);
    const poolX = minX - LANE_HEADER_W - POOL_MARGIN, poolW = (maxX - poolX) + POOL_MARGIN;
    // Fix (codex #2): lane rỗng → ps=[] làm Math.min(...[])=Infinity. Fallback về
    // biên node gần nhất; nếu không có node nào thì bỏ qua lane đó khỏi DI.
    const laneBounds = orderedLanes.map(L => {
      const ps = all.filter(p => p.lane === L.id);
      if (!ps.length) return { id: L.id, empty: true };
      return { id: L.id, top: Math.min(...ps.map(p => p.y)) - LANE_PADDING, bot: Math.max(...ps.map(p => p.y + p.h)) + LANE_PADDING };
    }).filter(b => !b.empty);
    if (laneBounds.length) {
      const poolTop = Math.min(...laneBounds.map(b => b.top)), poolBot = Math.max(...laneBounds.map(b => b.bot));
      poolDI = `      <bpmndi:BPMNShape bpmnElement="Participant_1" isHorizontal="true"><dc:Bounds x="${Math.round(poolX)}" y="${Math.round(poolTop)}" width="${Math.round(poolW)}" height="${Math.round(poolBot - poolTop)}"/></bpmndi:BPMNShape>\n`;
      laneBounds.forEach((b, i) => {
        const top = i === 0 ? poolTop : Math.round((laneBounds[i - 1].bot + b.top) / 2);
        const bot = i === laneBounds.length - 1 ? poolBot : Math.round((b.bot + laneBounds[i + 1].top) / 2);
        poolDI += `      <bpmndi:BPMNShape bpmnElement="${escId(b.id)}" isHorizontal="true"><dc:Bounds x="${Math.round(poolX + LANE_HEADER_W)}" y="${top}" width="${Math.round(poolW - LANE_HEADER_W)}" height="${bot - top}"/></bpmndi:BPMNShape>\n`;
      });
    }
    collab = `\n  <bpmn:collaboration id="Collaboration_1">\n    <bpmn:participant id="Participant_1" name="${esc(ir.process.title)}" processRef="${escId(ir.process.id)}"/>\n  </bpmn:collaboration>`;
    planeEl = 'Collaboration_1';
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Def_1" targetNamespace="http://bpmn.io/schema/bpmn">${collab}
  <bpmn:process id="${escId(ir.process.id)}" isExecutable="false">
${laneSet}${flowEls}  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="${planeEl}">
${poolDI}${shapes}${diEdges}    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
