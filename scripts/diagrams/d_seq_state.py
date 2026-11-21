import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ddlib import D, MUTED, ACCENT, INK, LINK

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr', 'html')


def write(name, d, ey, title, desc):
    open(os.path.join(OUT, name + '.html'), 'w', encoding='utf-8').write(d.html(name, ey, title, desc))


# ======================= SEQUENCE =======================
EYS = 'Sequence · UML · Kết quả kèo'
SEQ_LEG = [('node', 'Thành phần'), ('focal', 'Thành phần trọng tâm'), ('fragment', 'Khung rẽ nhánh'),
           ('arrow', 'Gọi'), ('dashed', 'Trả về'), ('async', 'Bất đồng bộ'), ('accent-arrow', 'Thông điệp chính')]


class S:
    def __init__(self, d, actors, top=56, bottom=None):
        self.d, self.x = d, {}
        self.top, self.bottom = top, bottom
        for key, cx, name, tag, kind in actors:
            self.x[key] = cx
        self.actors = actors

    def draw_actors(self):
        for key, cx, name, tag, kind in self.actors:
            self.d.lifeline(cx, self.top + 56, self.bottom)
            self.d.node(cx - 76, self.top, 152, 56, name, kind=kind, tag=tag)

    def m(self, a, b, y, text, kind='call'):
        xa, xb = self.x[a], self.x[b]
        x1 = xa + (4 if xb > xa else -4)
        x2 = xb - (4 if xb > xa else -4)
        self.d.path([(x1, y), (x2, y)], color={'accent': ACCENT, 'link': LINK}.get(kind, MUTED),
                    dashed=kind in ('return', 'async'), marker='arrow-open' if kind == 'async' else None,
                    width=1.4 if kind == 'accent' else 1.2)
        col = ACCENT if kind == 'accent' else (LINK if kind == 'link' else MUTED)
        self.d.label((x1 + x2) / 2, y - 14, text, color=col, upper=False)

    def self_(self, a, y, text, h=24):
        cx = self.x[a]
        self.d.path([(cx + 4, y), (cx + 44, y), (cx + 44, y + h), (cx + 6, y + h)])
        self.d.label(cx + 56, y + h / 2, text, anchor='start', upper=False)


def s1():
    d = D(1000, 860)
    s = S(d, [('A', 112, ['Người khai'], 'USER', 'input'), ('HT', 320, ['Hệ thống', 'kết quả kèo'], 'SYS', 'focal'),
              ('AI', 528, ['AI agent', 'đọc ảnh'], 'AI', 'backend'), ('TB', 720, ['Dịch vụ', 'thông báo'], 'NOTI', 'backend'),
              ('B', 896, ['Đội còn lại'], 'USER', 'input')], bottom=768)
    d.activation(320, 160, 564)
    s.m('HT', 'A', 168, 'hết giờ sân · nhắc chụp ảnh', 'async')
    s.m('A', 'HT', 212, 'tải 1–5 ảnh bảng tỉ số')
    s.m('HT', 'AI', 256, 'đọc từng ảnh')
    d.fragment(72, 280, 496, 188, 'ALT', [(316, '[AI đọc được, kể cả nguồn dự phòng]'), (396, '[hết mọi nguồn dự phòng]')], dividers=[372])
    s.m('AI', 'HT', 348, 'tỉ số · nhãn cột · độ chắc', 'return')
    s.m('AI', 'HT', 424, 'lỗi', 'return')
    s.m('HT', 'A', 452, 'mở form gõ tay (tối đa Vàng)', 'return')
    s.self_('HT', 492, 'kiểm tra luật, giờ chụp, trùng ảnh → xếp mức')
    s.m('HT', 'A', 568, 'bản điền sẵn + mức tin cậy', 'return')
    s.m('A', 'HT', 612, 'xác nhận hoặc sửa, bấm Gửi', 'accent')
    s.self_('HT', 636, 'lập kết quả đề xuất, tính hạn')
    s.m('HT', 'TB', 704, 'phát thông báo kết quả đề xuất', 'async')
    s.m('TB', 'B', 744, 'kết quả · mức · hạn phản hồi', 'async')
    s.draw_actors()
    d.legend(792, SEQ_LEG)
    return d


def s2():
    d = D(1000, 740)
    s = S(d, [('B1', 112, ['Người đội thua', 'phản hồi'], 'USER', 'input'), ('B2', 312, ['Đồng đội'], 'USER', 'input'),
              ('HT', 512, ['Hệ thống', 'kết quả kèo'], 'SYS', 'focal'), ('LG', 712, ['Ví · rating', '· điểm BXH'], 'STORE', 'store'),
              ('TB', 896, ['Dịch vụ', 'thông báo'], 'NOTI', 'backend')], bottom=648)
    d.activation(512, 160, 448)
    s.m('B1', 'HT', 172, 'Đồng ý (hoặc gửi ảnh khớp)')
    d.fragment(72, 196, 680, 324, 'ALT', [(232, '[kèo đơn, hoặc người chấp nhận là người trả]'), (312, '[kèo đôi]')], dividers=[288])
    s.m('HT', 'LG', 264, 'chốt: chia tiền tạm giữ, rating', 'accent')
    s.m('HT', 'B2', 344, 'đồng đội đã chấp nhận, grace 1h', 'async')
    s.m('B2', 'HT', 388, 'đồng ý, hoặc im lặng hết 1h')
    s.m('HT', 'LG', 432, 'chốt: chia tiền tạm giữ, rating')
    d.note(540, 456, 156, 44, ['Người còn lại phản đối', '→ tranh chấp (S3)'])
    s.m('HT', 'TB', 560, 'kết quả final', 'async')
    s.m('TB', 'B1', 604, 'thông báo cả roster', 'async')
    s.draw_actors()
    d.legend(672, SEQ_LEG)
    return d


def s3():
    d = D(1000, 760)
    s = S(d, [('HT', 112, ['Hệ thống', 'kết quả kèo'], 'SYS', 'backend'), ('AI', 320, ['AI agent', 'phán quyết'], 'AI', 'focal'),
              ('KB', 528, ['Kho tri thức', 'RAG'], 'STORE', 'store'), ('P', 720, ['Người chơi', 'hai đội'], 'USER', 'input'),
              ('AD', 896, ['Admin'], 'ADMIN', 'backend')], bottom=672)
    d.activation(320, 216, 200)
    s.self_('HT', 168, 'hết 2h · bằng chứng ủng hộ hai bên')
    s.m('HT', 'AI', 232, 'hồ sơ tranh chấp')
    s.m('AI', 'KB', 276, 'truy hồi luật và án lệ tương tự')
    s.m('KB', 'AI', 316, 'đoạn luật · án lệ Admin/mẫu', 'return')
    s.m('AI', 'HT', 404, 'kết quả · lý do · độ tin cậy', 'return')
    d.fragment(72, 432, 872, 176, 'ALT', [(468, '[độ tin cậy ≥ 0,85 và đúng khuôn]'), (548, '[tin cậy thấp, sai khuôn hoặc AI lỗi]')], dividers=[524])
    s.m('HT', 'P', 500, 'phán quyết tạm + lý do · mở 6h kháng nghị', 'accent')
    s.m('HT', 'AD', 580, 'chuyển hồ sơ kèm phân tích (nếu có)')
    d.note(340, 340, 176, 28, ['AI không nhận uy tín của ai'])
    s.draw_actors()
    d.legend(696, SEQ_LEG)
    return d


def s4():
    d = D(1000, 760)
    s = S(d, [('L', 112, ['Bên bị xử thua'], 'USER', 'input'), ('HT', 320, ['Hệ thống', 'kết quả kèo'], 'SYS', 'focal'),
              ('AD', 528, ['Admin'], 'ADMIN', 'backend'), ('LG', 720, ['Ví · rating', '· điểm BXH'], 'STORE', 'store'),
              ('KB', 896, ['Kho tri thức', 'RAG'], 'STORE', 'store')], bottom=672)
    d.activation(320, 160, 472)
    s.m('HT', 'L', 172, 'kết quả tạm · mở 6h kháng nghị', 'async')
    d.fragment(72, 196, 496, 284, 'ALT', [(232, '[kháng nghị có căn cứ]'), (424, '[chấp nhận, hoặc hết 6h]')], dividers=[400])
    s.m('L', 'HT', 264, 'kháng nghị + căn cứ')
    s.m('HT', 'AD', 308, 'chuyển hồ sơ (SLA 48h)')
    s.m('AD', 'HT', 352, 'quyết định cuối · xác nhận 2 bước', 'return')
    s.m('L', 'HT', 456, 'Chấp nhận (hoặc hẹn giờ)')
    d.note(124, 364, 152, 24, ['thiếu căn cứ → từ chối'])
    s.m('HT', 'LG', 536, 'chốt tiền, rating, BXH, vi phạm', 'accent')
    s.m('HT', 'KB', 588, 'lưu án lệ (chỉ hồ sơ có Admin)', 'async')
    s.draw_actors()
    d.legend(696, SEQ_LEG)
    return d


# ======================= STATE =======================
EYST = 'State machine · UML · Hồ sơ kết quả'
ST_LEG = [('startend', 'Bắt đầu / kết thúc'), ('state', 'Trạng thái'), ('focal', 'Trạng thái trọng tâm'),
          ('external', 'Trạng thái ở sơ đồ khác'), ('arrow', 'Chuyển trạng thái')]
SW, SH = 184, 56


def st(d, cx, cy, name, sub=None, kind='backend'):
    d.state(cx - SW / 2, cy - SH / 2, SW, SH, name, sub=sub, kind=kind)
    return dict(cx=cx, cy=cy, l=cx - SW / 2, r=cx + SW / 2, t=cy - SH / 2, b=cy + SH / 2)


def tr(d, pts, text, lpos, anchor='middle'):
    d.path(pts)
    d.label(lpos[0], lpos[1], text, upper=False, anchor=anchor)


def st1():
    d = D(1160, 640)
    C = [140, 440, 740, 1030]
    R = [120, 280, 440]
    mid = lambda i: (C[i] + C[i + 1]) / 2
    d.start(28, 120)
    k = st(d, C[0], R[0], 'Đang mở khai', '12h · giãn qua đêm')
    p = st(d, C[1], R[0], 'Có kết quả đề xuất', 'Xanh · Vàng · Đỏ')
    g = st(d, C[2], R[0], 'Grace kèo đôi', 'tối đa 1h')
    t = st(d, C[0], R[1], 'Tạm Không có kết quả', '12h báo sự cố')
    c = st(d, C[1], R[1], 'Đã chốt', 'có người thắng · hoặc Không KQ', kind='focal')
    x = st(d, C[3], R[1], 'Tranh chấp', 'xem sơ đồ ST2', kind='external')
    a = st(d, C[3], R[2], 'Admin xử', 'SLA 48h')
    d.path([(35, 120), (k['l'], 120)])
    tr(d, [(k['r'], 120), (p['l'], 120)], 'bản khai đầu tiên', (mid(0), 106))
    tr(d, [(C[0], k['b']), (C[0], t['t'])], 'hết hạn khai', (C[0] + 10, 200), anchor='start')
    tr(d, [(t['r'], 280), (c['l'], 280)], 'hết 12h không sự cố', (mid(0), 266))
    tr(d, [(C[1], p['b']), (C[1], c['t'])], 'đơn chấp nhận / hết cửa sổ', (C[1] + 10, 200), anchor='start')
    tr(d, [(p['r'], 120), (g['l'], 120)], 'đôi: 1 người đồng ý', (mid(1), 106))
    tr(d, [(C[2] - 24, g['b']), (C[2] - 24, 268), (c['r'], 268)], 'chấp nhận / hết 1h', (C[2] - 14, 200), anchor='start')
    tr(d, [(g['r'], 120), (C[3] - 12, 120), (C[3] - 12, x['t'])], 'phản đối', (C[3] - 22, 196), anchor='end')
    tr(d, [(C[1] + 40, p['t']), (C[1] + 40, 64), (C[3] + 24, 64), (C[3] + 24, x['t'])], 'bất đồng: tỉ số sai', (C[2], 50))
    tr(d, [(x['l'], 292), (c['r'], 292)], 'hết 6h / chấp nhận', (C[2], 312))
    tr(d, [(C[3], x['b']), (C[3], a['t'])], 'kháng nghị / AI thấp', (C[3] - 10, 360), anchor='end')
    tr(d, [(a['l'], 440), (C[1] - 24, 440), (C[1] - 24, c['b'])], 'quyết định cuối', (C[2], 426))
    d.path([(C[1] + 24, c['b']), (C[1] + 24, 371)])
    d.end(C[1] + 24, 380)
    d.note(40, 392, 248, 60, ['* → Admin xử khi: báo sự cố', '(từ mọi trạng thái trước khi chốt),', 'hoặc bản Đỏ hết cửa sổ / có chấp nhận'])
    d.legend(560, ST_LEG)
    return d


def st2():
    d = D(1040, 700)
    C = [170, 450, 730, 930]
    d.start(450, 40)
    e = st(d, C[1], 112, '2h nộp bằng chứng', 'ảnh mới giữ kín')
    r = st(d, C[0], 260, 'Kết quả tạm tầng 1', 'luật bằng chứng')
    ai = st(d, C[2], 260, 'Phán quyết tạm tầng 2', 'AI + RAG', kind='focal')
    ap = st(d, C[1], 400, '6h kháng nghị', 'giãn qua đêm')
    ch = st(d, C[1], 540, 'Đã chốt', 'xem ST1', kind='external')
    ad = st(d, C[3], 540, 'Admin xử', 'SLA 48h')
    d.path([(450, 47), (450, e['t'])])
    tr(d, [(e['l'], 112), (C[0], 112), (C[0], r['t'])], '1 bên / 0 bên', (260, 98))
    tr(d, [(e['r'], 104), (C[2], 104), (C[2], ai['t'])], '≥ 2 bên, tin cậy cao', (650, 90))
    tr(d, [(e['r'], 120), (C[3] + 24, 120), (C[3] + 24, ad['t'])], 'AI không đọc / tin cậy thấp', (C[3] + 14, 300), anchor='end')
    tr(d, [(C[0], r['b']), (C[0], 400), (ap['l'], 400)], 'công bố', (C[0] + 10, 340), anchor='start')
    tr(d, [(C[2], ai['b']), (C[2], 392), (ap['r'], 392)], 'công bố', (C[2] + 10, 340), anchor='start')
    tr(d, [(C[1], ap['b']), (C[1], ch['t'])], 'hết 6h / bên thua chấp nhận', (C[1] + 10, 470), anchor='start')
    tr(d, [(ap['r'], 412), (C[3] - 24, 412), (C[3] - 24, ad['t'])], 'kháng nghị có căn cứ', (680, 426))
    tr(d, [(ad['l'], 540), (ch['r'], 540)], 'quyết định cuối', (740, 526))
    # tự lặp: kháng nghị thiếu căn cứ
    d.path([(C[1] - 60, ap['t']), (C[1] - 60, 340), (C[1] - 20, 340), (C[1] - 20, ap['t'])])
    d.label(C[1] - 70, 330, 'thiếu căn cứ / từ chối', upper=False, anchor='end')
    d.legend(620, ST_LEG)
    return d


# ======================= FLOWCHART =======================
def f1():
    d = D(1120, 760)
    d.oval(400, 32, 160, 48, ['Hồ sơ final'])
    d.diamond(480, 160, 200, 88, ['Hồ sơ', 'qua Admin?'])
    d.diamond(480, 300, 224, 96, ['Admin xác nhận', 'lỗi do người?'])
    d.diamond(800, 300, 208, 96, ['Ảnh trùng chính xác', 'hồ sơ khác?'])
    d.node(380, 420, 200, 56, 'Ghi 1 vi phạm', sub='tối đa 1 / người / hồ sơ', kind='focal')
    d.oval(952, 276, 152, 48, ['Không ghi vi phạm'])
    d.node(360, 524, 240, 56, 'Đếm vi phạm trong 90 ngày', sub='0 Tốt · 1 Cần chú ý · ≥2 Thấp')
    d.oval(330, 628, 300, 56, ['Uy tín Thấp: không được Xanh,', 'phản đối phải kèm ảnh'])
    d.path([(480, 80), (480, 116)])
    d.path([(480, 204), (480, 252)]); d.label(500, 228, '[có]', anchor='start')
    d.path([(580, 160), (800, 160), (800, 252)]); d.label(690, 146, '[không]')
    d.path([(592, 300), (688, 300)]); d.label(640, 286, '[không]')
    d.path([(480, 348), (480, 420)]); d.label(500, 384, '[có]', anchor='start')
    d.path([(800, 348), (800, 448), (580, 448)]); d.label(690, 434, '[có]')
    d.path([(904, 300), (952, 300)]); d.label(928, 286, '[không]')
    d.path([(480, 476), (480, 524)])
    d.path([(480, 580), (480, 628)])
    d.note(660, 528, 380, 60, ['Admin xác nhận: cố ý khai sai (kể cả sửa tay, chọn cột sai),',
                               'ảnh gần trùng là gian lận, kháng nghị không căn cứ,', 'báo sự cố sai. Không ảnh hưởng tiền, rating, AI.'])
    d.legend(704, [('external', 'Bắt đầu / kết thúc'), ('node', 'Bước'), ('decision', 'Quyết định'), ('focal', 'Kết quả trọng tâm')])
    return d


if __name__ == '__main__':
    write('s1-khai-ket-qua', s1(), EYS, 'S1 — Khai kết quả bằng ảnh',
          'Người khai tải ảnh, hệ thống gọi AI agent đọc tỉ số hoặc mở form gõ tay khi AI lỗi, rồi lập kết quả đề xuất và báo cho đội còn lại.')
    write('s2-doi-thua-chap-nhan', s2(), EYS, 'S2 — Đội thua chấp nhận và chốt kết quả',
          'Kèo đơn chốt ngay khi đội thua đồng ý; kèo đôi chờ đồng đội tối đa 1 giờ rồi chốt tiền, rating và thông báo.')
    write('s3-tang-2-ai-phan-quyet', s3(), EYS, 'S3 — Tầng 2: AI agent ra phán quyết tạm',
          'AI agent nhận hồ sơ tranh chấp, truy hồi luật và án lệ qua RAG, trả phán quyết tạm; tin cậy cao thì công bố, thấp thì chuyển Admin.')
    write('s4-khang-nghi-va-chot', s4(), EYS, 'S4 — Kháng nghị và chốt kết quả',
          'Bên bị xử thua có 6 giờ kháng nghị có căn cứ lên Admin hoặc chấp nhận; sau đó hệ thống chốt tiền, rating và lưu án lệ.')
    write('st1-vong-doi-ho-so', st1(), EYST, 'ST1 — Vòng đời hồ sơ kết quả',
          'Hồ sơ đi từ mở khai qua kết quả đề xuất, grace, tranh chấp hoặc Admin tới trạng thái đã chốt.')
    write('st2-chi-tiet-tranh-chap', st2(), EYST, 'ST2 — Chi tiết trạng thái tranh chấp',
          'Trong tranh chấp, hồ sơ qua 2 giờ bằng chứng, kết quả tạm tầng 1 hoặc phán quyết tạm tầng 2, 6 giờ kháng nghị, rồi chốt hoặc chuyển Admin.')
    write('f1-ghi-vi-pham-uy-tin', f1(), 'Flowchart · Uy tín người chơi', 'F1 — Ghi vi phạm uy tín',
          'Vi phạm chỉ ghi tự động khi ảnh trùng chính xác hồ sơ khác; mọi trường hợp khác cần Admin xác nhận, tối đa một vi phạm mỗi người mỗi hồ sơ.')
    print('ok')
