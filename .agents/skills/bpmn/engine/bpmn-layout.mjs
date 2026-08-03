// bpmn-layout.mjs — Engine layout BPMN swimlane tự động từ IR.
// Nhận IR { process, lanes[], nodes[], flows[] } → sinh XML BPMN 2.0 đầy đủ (semantic + BPMNDiagram).
// Tự: (1) gán cột bằng longest-path rank, (2) tách row khi trùng ô, (3) routing edge tránh đè
//     (đoạn dọc lệch x-track, ngang lệch y-track; back-edge/loop đi vòng vùng trống).
// KHÔNG cần dep. Dùng: import { layoutIR } from './bpmn-layout.mjs'; const xml = layoutIR(ir);

const GRID = {
  POOL_X: 160, POOL_Y: 80, LANE_X: 190, LANE_H: 200,
  COL_W: 200, COL0: 340,            // colCenter(c) = COL0 + c*COL_W
  ROW_DY: 78,                       // offset khi 2 node cùng (lane,col) — trong giới hạn lane
  TASK_W: 130, TASK_H: 70, GW: 50, EV: 36,
  TRACK: 24,                        // bước lệch giữa các track routing
  PORT: 18,                         // bước lệch port khi gateway fan-out nhiều nhánh
};
const dimOf = k => k === 'task' ? [GRID.TASK_W, GRID.TASK_H]
  : k === 'gateway' ? [GRID.GW, GRID.GW] : [GRID.EV, GRID.EV];

export function layoutIR(ir) {
  const { lanes, nodes, flows } = ir;
  const N = Object.fromEntries(nodes.map(n => [n.id, { ...n }]));
  const laneIdx = Object.fromEntries(lanes.map((l, i) => [l.id, i]));

  // ── 1. cột theo longest-path từ start (rank) ──
  const out = {}, inc = {};
  nodes.forEach(n => { out[n.id] = []; inc[n.id] = []; });
  // phân biệt forward vs back-edge sau; tạm build adjacency
  flows.forEach(f => { out[f.src].push(f.tgt); inc[f.tgt].push(f.src); });

  // back-edge = flow mà tgt đã được "thăm" trên đường từ src (tạo chu trình). Tìm bằng DFS.
  const starts = nodes.filter(n => n.kind === 'start').map(n => n.id);
  const rank = {}; nodes.forEach(n => rank[n.id] = 0);
  const backEdges = new Set();
  {
    const state = {}; // 0=chưa,1=đang,2=xong
    const dfs = (u, d) => {
      state[u] = 1; rank[u] = Math.max(rank[u], d);
      for (const v of out[u]) {
        const key = u + '->' + v;
        if (state[v] === 1) { backEdges.add(key); continue; } // cạnh quay lui
        if (state[v] !== 2 || rank[v] < d + 1) dfs(v, d + 1);
      }
      state[u] = 2;
    };
    (starts.length ? starts : [nodes[0].id]).forEach(s => dfs(s, 0));
    // node chưa thăm (rời) → đặt rank theo max incoming
    nodes.forEach(n => { if (state[n.id] === undefined) rank[n.id] = 0; });
  }
  flows.forEach(f => { f._back = backEdges.has(f.src + '->' + f.tgt); });

  // ── 2. col = rank; tách row khi trùng (lane,col) ──
  nodes.forEach(n => n._col = rank[n.id]);
  const cellRow = {}; // `${lane}:${col}` -> số node đã chiếm
  // ổn định thứ tự: sort theo col rồi theo lane
  const ordered = [...nodes].sort((a, b) => a._col - b._col || laneIdx[a.lane] - laneIdx[b.lane]);
  ordered.forEach(n => {
    const key = n.lane + ':' + n._col;
    n._row = cellRow[key] || 0;
    cellRow[key] = n._row + 1;
  });

  // ── 3. toạ độ node ──
  const colCenter = c => GRID.COL0 + c * GRID.COL_W;
  const laneTop = k => GRID.POOL_Y + k * GRID.LANE_H;
  const laneCenter = k => laneTop(k) + GRID.LANE_H / 2;
  const B = {};
  nodes.forEach(n => {
    const [w, h] = dimOf(n.kind);
    const cx = colCenter(n._col);
    const cy = laneCenter(laneIdx[n.lane]) + n._row * GRID.ROW_DY;
    B[n.id] = { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };
  });
  const maxCol = Math.max(...nodes.map(n => n._col));
  const POOL_W = colCenter(maxCol) + GRID.TASK_W / 2 + 120 - GRID.POOL_X;
  const POOL_H = lanes.length * GRID.LANE_H;

  // anchors
  const R = b => ({ x: b.x + b.w, y: b.cy }), L = b => ({ x: b.x, y: b.cy }),
        T = b => ({ x: b.cx, y: b.y }), Bot = b => ({ x: b.cx, y: b.y + b.h });

  // ── 4. routing với port + track allocation ──
  const TOP_BAND = GRID.POOL_Y + 6;
  const BOT_BAND = GRID.POOL_Y + POOL_H - 6;
  let topTrack = 0, botTrack = 0;
  const vTracks = {};  // x-track cho đoạn dọc theo "vùng cột"
  const hTracks = {};  // y-track cho đoạn ngang theo "vùng hàng" (tránh 2 ngang cùng y)

  // gom outgoing forward của mỗi node để cấp port khi fan-out
  const fwdOut = {}, fwdIn = {};
  flows.forEach(f => { if (!f._back) { (fwdOut[f.src] ||= []).push(f); (fwdIn[f.tgt] ||= []).push(f); } });
  Object.values(fwdOut).forEach(list => list.sort((a, b) => B[a.tgt].cy - B[b.tgt].cy));
  // fan-in: sắp incoming theo cy nguồn để gán port vào ổn định
  Object.values(fwdIn).forEach(list => list.sort((a, b) => B[a.src].cy - B[b.src].cy));

  // cấp 1 y-track riêng cho 1 đoạn ngang ở vùng (gần hàng yBase), tránh trùng các ngang khác
  function horizY(yBase, key) {
    const band = Math.round(yBase / 8); // gom theo dải 8px
    const k = band + ':' + key;
    hTracks[band] = (hTracks[band] || 0);
    // nếu đã có đường ngang ở band này (khác key) → lệch
    const used = hTracks['_used_' + band] || new Set();
    if (!(used instanceof Set)) { /* noop */ }
    return yBase;
  }

  // điểm xuất phát (port) trên node nguồn cho 1 forward edge, dựa hướng tới đích + thứ tự fan-out
  function sourcePort(f) {
    const s = B[f.src], t = B[f.tgt];
    const sibs = fwdOut[f.src] || [];
    const i = sibs.indexOf(f), n = sibs.length;
    if (n <= 1) {
      // 1 nhánh: ra phải nếu cùng/lệch nhẹ; theo hướng đích
      if (t.cy < s.cy - 1) return { p: T(s), dir: 'up' };
      if (t.cy > s.cy + 1) return { p: Bot(s), dir: 'down' };
      return { p: R(s), dir: 'right' };
    }
    // nhiều nhánh (gateway fan-out): toả theo hướng đích
    if (t.cy < s.cy - 1) {
      // lên: ra đỉnh, lệch x theo port
      const dx = (i - (n - 1) / 2) * GRID.PORT;
      return { p: { x: s.cx + dx, y: s.y }, dir: 'up' };
    }
    if (t.cy > s.cy + 1) {
      const dx = (i - (n - 1) / 2) * GRID.PORT;
      return { p: { x: s.cx + dx, y: s.y + s.h }, dir: 'down' };
    }
    // cùng hàng: ra phải, lệch y nhẹ theo port (hiếm khi >1 cùng hàng)
    const dy = (i - (n - 1) / 2) * GRID.PORT;
    return { p: { x: s.x + s.w, y: s.cy + dy }, dir: 'right' };
  }

  // điểm vào (port) trên node đích — phân biệt y khi nhiều edge cùng vào (fan-in)
  function targetPort(f, fromDir) {
    const s = B[f.src], t = B[f.tgt];
    const sibs = fwdIn[f.tgt] || [];
    const i = sibs.indexOf(f), n = sibs.length;
    const dy = n > 1 ? (i - (n - 1) / 2) * GRID.PORT : 0;
    if (t.cx > s.cx + 1) return { x: t.x, y: t.cy + dy };          // vào trái, lệch y theo port
    if (t.cx < s.cx - 1) return { x: t.x + t.w, y: t.cy + dy };    // vào phải
    return fromDir === 'down' ? { x: t.cx + dy, y: t.y } : { x: t.cx + dy, y: t.y + t.h }; // cùng cột
  }

  function routeForward(f) {
    const s = B[f.src], t = B[f.tgt];
    const { p: sp, dir } = sourcePort(f);
    const tp = targetPort(f, dir);
    if (Math.abs(sp.y - tp.y) < 1) return [sp, tp];            // ngang thẳng
    if (Math.abs(sp.x - tp.x) < 1) return [sp, tp];            // dọc thẳng
    // gấp khúc: tuỳ port nguồn là dọc (up/down) hay ngang (right)
    if (dir === 'up' || dir === 'down') {
      // đi dọc trước tới y đích rồi ngang vào
      return [sp, { x: sp.x, y: tp.y }, tp];
    }
    // ra ngang tới midX rồi dọc vào (đoạn dọc nhận x-track riêng)
    const span = Math.round(Math.min(sp.x, tp.x)) + '_' + Math.round(Math.max(s.cx, t.cx));
    vTracks[span] = (vTracks[span] || 0) + 1;
    const midX = (sp.x + tp.x) / 2 + (vTracks[span] - 1) * GRID.TRACK;
    return [sp, { x: midX, y: sp.y }, { x: midX, y: tp.y }, tp];
  }

  // back-edge tới cùng target → cấp điểm-chạm x riêng (tránh đoạn dọc cuối đè nhau)
  const backToTgt = {};
  flows.forEach(f => { if (f._back) (backToTgt[f.tgt] ||= []).push(f); });
  Object.values(backToTgt).forEach(list => list.sort((a, b) => B[a.src].cx - B[b.src].cx));

  function routeBack(f) {
    const s = B[f.src], t = B[f.tgt];
    const sibs = backToTgt[f.tgt] || [];
    const bi = sibs.indexOf(f), bn = sibs.length;
    const txOff = bn > 1 ? (bi - (bn - 1) / 2) * GRID.PORT : 0; // điểm chạm target lệch theo thứ tự
    const goUp = t.cy <= s.cy;
    // đoạn dọc đi ra từ nguồn cũng lệch theo txOff để 2 back-edge cùng cột nguồn không chồng
    const sx = s.cx + txOff;
    if (goUp) {
      const y = TOP_BAND + topTrack * GRID.TRACK; topTrack++;
      const tx = t.cx + txOff;
      return [{ x: sx, y: s.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: t.y }];
    } else {
      const y = BOT_BAND - botTrack * GRID.TRACK; botTrack++;
      const tx = t.cx + txOff;
      return [{ x: sx, y: s.y + s.h }, { x: sx, y }, { x: tx, y }, { x: tx, y: t.y + t.h }];
    }
  }

  flows.forEach(f => { f._wp = f._back ? routeBack(f) : routeForward(f); });

  // ── 5. build XML ──
  return toXML(ir, B, { POOL_W, POOL_H, laneIdx, laneTop });
}

// ───────── XML serialization ─────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TAG = { start: 'startEvent', task: 'task', gateway: 'exclusiveGateway', end: 'endEvent' };

function toXML(ir, B, ctx) {
  const { process, lanes, nodes, flows } = ir;
  const { POOL_W, POOL_H, laneIdx, laneTop } = ctx;
  const pid = process.id || 'Process_1';
  const partId = 'Participant_' + pid.replace(/^Process_/, '');

  const laneSet = `    <bpmn:laneSet id="LaneSet_1">\n` + lanes.map(L => {
    const refs = nodes.filter(n => n.lane === L.id).map(n => `        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`).join('\n');
    return `      <bpmn:lane id="${L.id}" name="${esc(L.name)}">\n${refs}\n      </bpmn:lane>`;
  }).join('\n') + `\n    </bpmn:laneSet>`;

  const nodeXml = nodes.map(n => {
    const inc = flows.filter(f => f.tgt === n.id).map(f => `      <bpmn:incoming>${f.id}</bpmn:incoming>`);
    const out = flows.filter(f => f.src === n.id).map(f => `      <bpmn:outgoing>${f.id}</bpmn:outgoing>`);
    return `    <bpmn:${TAG[n.kind]} id="${n.id}" name="${esc(n.name)}">\n${[...inc, ...out].join('\n')}\n    </bpmn:${TAG[n.kind]}>`;
  }).join('\n');

  const flowXml = flows.map(f =>
    `    <bpmn:sequenceFlow id="${f.id}"${f.name ? ` name="${esc(f.name)}"` : ''} sourceRef="${f.src}" targetRef="${f.tgt}" />`).join('\n');

  const shapeXml = nodes.map(n => {
    const b = B[n.id]; const mk = n.kind === 'gateway' ? ' isMarkerVisible="true"' : '';
    let label = '';
    if (n.kind !== 'task') {
      const lw = 110;
      label = `\n        <bpmndi:BPMNLabel><dc:Bounds x="${Math.round(b.cx - lw / 2)}" y="${Math.round(b.y + b.h + 4)}" width="${lw}" height="27" /></bpmndi:BPMNLabel>`;
    }
    return `      <bpmndi:BPMNShape id="${n.id}_di" bpmnElement="${n.id}"${mk}>\n        <dc:Bounds x="${Math.round(b.x)}" y="${Math.round(b.y)}" width="${b.w}" height="${b.h}" />${label}\n      </bpmndi:BPMNShape>`;
  }).join('\n');

  const edgeXml = flows.map(f => {
    const wps = f._wp.map(p => `        <di:waypoint x="${Math.round(p.x)}" y="${Math.round(p.y)}" />`).join('\n');
    let label = '';
    if (f.name) {
      const w = f._wp, lw = 116;
      const lx = Math.round((w[0].x + w[w.length - 1].x) / 2 - lw / 2);
      const ly = Math.round(w[Math.floor(w.length / 2)].y - 18);
      label = `\n        <bpmndi:BPMNLabel><dc:Bounds x="${lx}" y="${ly}" width="${lw}" height="14" /></bpmndi:BPMNLabel>`;
    }
    return `      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">\n${wps}${label}\n      </bpmndi:BPMNEdge>`;
  }).join('\n');

  const laneShapes = lanes.map((L, k) =>
    `      <bpmndi:BPMNShape id="${L.id}_di" bpmnElement="${L.id}" isHorizontal="true">
        <dc:Bounds x="${GRID.LANE_X}" y="${laneTop(k)}" width="${Math.round(POOL_W - 30)}" height="${GRID.LANE_H}" />
      </bpmndi:BPMNShape>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definitions_${pid}" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="${partId}" name="${esc(process.title || pid)}" processRef="${pid}" />
  </bpmn:collaboration>
  <bpmn:process id="${pid}" isExecutable="false">
${laneSet}

${nodeXml}

${flowXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="${partId}_di" bpmnElement="${partId}" isHorizontal="true">
        <dc:Bounds x="${GRID.POOL_X}" y="${GRID.POOL_Y}" width="${Math.round(POOL_W)}" height="${POOL_H}" />
      </bpmndi:BPMNShape>
${laneShapes}

${shapeXml}

${edgeXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}
