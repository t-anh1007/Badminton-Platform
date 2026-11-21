"""Sinh file BPMN 2.0 (kèm toạ độ DI) từ mô hình lưới lane/hàng/cột.

Dùng một lần cho sơ đồ AS-IS / TO-BE; file .bpmn kết quả mở/sửa được trên demo.bpmn.io.
"""
from xml.sax.saxutils import escape

COLW, ROWH, X0, POOL_HDR, LANE_HDR = 165, 120, 80, 30, 30
SIZE = {
    'task': (120, 72), 'userTask': (120, 72), 'serviceTask': (120, 72),
    'businessRuleTask': (120, 72), 'manualTask': (120, 72),
    'exclusiveGateway': (50, 50), 'eventBasedGateway': (50, 50),
    'subProcess': (128, 80), 'startEvent': (36, 36), 'endEvent': (36, 36), 'intermediateCatchEvent': (36, 36),
}


def build(pid, pool_name, lanes, nodes, boundaries, flows, out):
    # lanes: [(id, name, rows)] ; nodes: id -> (type, name, lane, row, col, evdef)
    lane_top, lane_rows, y = {}, {}, 0
    for lid, _, rows in lanes:
        lane_top[lid], lane_rows[lid] = y, rows
        y += rows * ROWH
    abs_row = {}
    r0 = 0
    for lid, _, rows in lanes:
        abs_row[lid] = r0
        r0 += rows
    ncols = max(n[4] for n in nodes.values()) + 1
    pool_w = POOL_HDR + LANE_HDR + X0 + ncols * COLW
    pool_h = y

    geo, cell = {}, {}
    for nid, (typ, name, lane, row, col, _) in nodes.items():
        w, h = SIZE[typ]
        cx = POOL_HDR + LANE_HDR + X0 + col * COLW + COLW / 2 - 40
        cy = lane_top[lane] + row * ROWH + ROWH / 2
        geo[nid] = (cx - w / 2, cy - h / 2, w, h)
        cell[(abs_row[lane] + row, col)] = nid
    pos = {nid: (abs_row[n[2]] + n[3], n[4]) for nid, n in nodes.items()}
    for bid, (att, _, _) in boundaries.items():
        x, yy, w, h = geo[att]
        geo[bid] = (x + w - 38, yy + h - 18, 36, 36)
        pos[bid] = pos[att]

    def c(n):
        x, yy, w, h = geo[n]
        return x + w / 2, yy + h / 2

    def hits(cells):
        return sum(1 for k in cells if k in cell)

    def route(s, t):
        (sr, sc), (tr, tc) = pos[s], pos[t]
        (sx, sy), (tx, ty) = c(s), c(t)
        _, _, sw, sh = geo[s]
        _, _, tw, th = geo[t]
        if s in boundaries:
            by = sy + sh / 2
            lo, hi = sorted((sr, tr))
            cols_b = [k for k in range(min(sc, tc) + 1, max(sc, tc))]
            a = hits([(r, sc) for r in range(lo + 1, hi)] + [(tr, k) for k in cols_b]) if tr != sr else 99
            b = hits([(sr, k) for k in cols_b] + [(r, tc) for r in range(lo + 1, hi)])
            ex = tx - tw / 2 if tc > sc else tx + tw / 2
            if a <= b and tc != sc:
                return [(sx, by), (sx, ty), (ex, ty)]
            yb = by + 22
            if tr > sr:
                return [(sx, by), (sx, yb), (tx, yb), (tx, ty - th / 2)]
            if tr < sr:
                return [(sx, by), (sx, yb), (tx, yb), (tx, ty + th / 2)]
            return [(sx, by), (sx, yb), (ex - 20 if tc > sc else ex + 20, yb), (ex - 20 if tc > sc else ex + 20, ty), (ex, ty)]
        if sr == tr:
            if tc > sc:
                return [(sx + sw / 2, sy), (tx - tw / 2, ty)]
            return [(sx, sy + sh / 2), (sx, sy + sh / 2 + 30), (tx, sy + sh / 2 + 30), (tx, ty + th / 2)]
        down = tr > sr
        if sc == tc:
            return [(sx, sy + (sh / 2 if down else -sh / 2)), (tx, ty + (-th / 2 if down else th / 2))]
        rows_between = [r for r in range(min(sr, tr) + 1, max(sr, tr))]
        cols_between = [k for k in range(min(sc, tc) + 1, max(sc, tc))]
        a = hits([(r, sc) for r in rows_between] + [(tr, k) for k in cols_between])
        b = hits([(sr, k) for k in cols_between] + [(r, tc) for r in rows_between])
        if a <= b:  # dọc trước rồi ngang
            ex = tx - tw / 2 if tc > sc else tx + tw / 2
            return [(sx, sy + (sh / 2 if down else -sh / 2)), (sx, ty), (ex, ty)]
        return [(sx + (sw / 2 if tc > sc else -sw / 2), sy), (tx, sy), (tx, ty + (-th / 2 if down else th / 2))]

    P = []
    P.append('<?xml version="1.0" encoding="UTF-8"?>')
    P.append('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" '
             'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" '
             'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" '
             'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" '
             f'id="Defs_{pid}" targetNamespace="http://courtin.local/bpmn">')
    P.append(f'<bpmn:collaboration id="Collab_{pid}"><bpmn:participant id="Pool_{pid}" name="{escape(pool_name)}" processRef="{pid}"/></bpmn:collaboration>')
    P.append(f'<bpmn:process id="{pid}" isExecutable="false">')
    P.append(f'<bpmn:laneSet id="LaneSet_{pid}">')
    for lid, lname, _ in lanes:
        refs = ''.join(f'<bpmn:flowNodeRef>{n}</bpmn:flowNodeRef>' for n, v in nodes.items() if v[2] == lid)
        refs += ''.join(f'<bpmn:flowNodeRef>{b}</bpmn:flowNodeRef>' for b, (att, _, _) in boundaries.items() if nodes[att][2] == lid)
        P.append(f'<bpmn:lane id="{lid}" name="{escape(lname)}">{refs}</bpmn:lane>')
    P.append('</bpmn:laneSet>')
    inc = {}
    out_ = {}
    for fid, s, t, _ in flows:
        out_.setdefault(s, []).append(fid)
        inc.setdefault(t, []).append(fid)

    def ios(n):
        return ''.join(f'<bpmn:incoming>{f}</bpmn:incoming>' for f in inc.get(n, [])) + \
               ''.join(f'<bpmn:outgoing>{f}</bpmn:outgoing>' for f in out_.get(n, []))

    for nid, (typ, name, _, _, _, ev) in nodes.items():
        evx = f'<bpmn:{ev}EventDefinition id="{nid}_def"/>' if ev else ''
        P.append(f'<bpmn:{typ} id="{nid}" name="{escape(name)}">{ios(nid)}{evx}</bpmn:{typ}>')
    for bid, (att, ev, name) in boundaries.items():
        P.append(f'<bpmn:boundaryEvent id="{bid}" name="{escape(name)}" attachedToRef="{att}">{ios(bid)}'
                 f'<bpmn:{ev}EventDefinition id="{bid}_def"/></bpmn:boundaryEvent>')
    for fid, s, t, name in flows:
        nm = f' name="{escape(name)}"' if name else ''
        P.append(f'<bpmn:sequenceFlow id="{fid}"{nm} sourceRef="{s}" targetRef="{t}"/>')
    P.append('</bpmn:process>')

    P.append(f'<bpmndi:BPMNDiagram id="Diag_{pid}"><bpmndi:BPMNPlane id="Plane_{pid}" bpmnElement="Collab_{pid}">')
    P.append(f'<bpmndi:BPMNShape id="Pool_{pid}_di" bpmnElement="Pool_{pid}" isHorizontal="true"><dc:Bounds x="0" y="0" width="{pool_w}" height="{pool_h}"/></bpmndi:BPMNShape>')
    for lid, _, rows in lanes:
        P.append(f'<bpmndi:BPMNShape id="{lid}_di" bpmnElement="{lid}" isHorizontal="true"><dc:Bounds x="{POOL_HDR}" y="{lane_top[lid]}" width="{pool_w - POOL_HDR}" height="{rows * ROWH}"/></bpmndi:BPMNShape>')
    routes = {fid: route(s, t) for fid, s, t, _ in flows}
    used = {}
    for fid, s, t, _ in flows:
        wp = routes[fid]
        for n, pt in ((s, wp[0]), (t, wp[-1])):
            x, yy, w, h = geo[n]
            if abs(pt[1] - yy) < 1:
                used.setdefault(n, set()).add('top')
            if abs(pt[1] - (yy + h)) < 1:
                used.setdefault(n, set()).add('bottom')
    for nid, (typ, name, *_rest) in nodes.items():
        x, yy, w, h = geo[nid]
        mk = ' isMarkerVisible="true"' if typ == 'exclusiveGateway' else (' isExpanded="false"' if typ == 'subProcess' else '')
        lab = ''
        if name and typ in ('exclusiveGateway', 'eventBasedGateway', 'startEvent', 'endEvent', 'intermediateCatchEvent'):
            u = used.get(nid, set())
            lw, lh = 120, 30
            if 'bottom' not in u:
                lx, ly = x + w / 2 - lw / 2, yy + h + 4
            elif 'top' not in u:
                lx, ly = x + w / 2 - lw / 2, yy - lh - 4
            else:
                lx, ly = x + w + 4, yy - lh
            lab = f'<bpmndi:BPMNLabel><dc:Bounds x="{lx:.0f}" y="{ly:.0f}" width="{lw}" height="{lh}"/></bpmndi:BPMNLabel>'
        P.append(f'<bpmndi:BPMNShape id="{nid}_di" bpmnElement="{nid}"{mk}><dc:Bounds x="{x:.0f}" y="{yy:.0f}" width="{w}" height="{h}"/>{lab}</bpmndi:BPMNShape>')
    for bid in boundaries:
        x, yy, w, h = geo[bid]
        P.append(f'<bpmndi:BPMNShape id="{bid}_di" bpmnElement="{bid}"><dc:Bounds x="{x:.0f}" y="{yy:.0f}" width="{w}" height="{h}"/></bpmndi:BPMNShape>')
    for fid, s, t, _ in flows:
        wps = ''.join(f'<di:waypoint x="{x:.0f}" y="{yy:.0f}"/>' for x, yy in routes[fid])
        P.append(f'<bpmndi:BPMNEdge id="{fid}_di" bpmnElement="{fid}">{wps}</bpmndi:BPMNEdge>')
    P.append('</bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>')
    open(out, 'w', encoding='utf-8').write('\n'.join(P))
    print('wrote', out, f'{pool_w}x{pool_h}')
