import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ddlib import D, MUTED, ACCENT

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr', 'html')
EY = 'Activity · UML · Kết quả kèo'
W_ACT, DW, DH = 248, 208, 88


class A:
    """Toạ độ tiện dụng cho activity: action tâm (cx, cy)."""
    def __init__(self, d):
        self.d = d

    def act(self, cx, cy, name, sub=None, kind='backend', w=W_ACT, h=None):
        lines = name if isinstance(name, list) else [name]
        h = h or (48 if len(lines) + (1 if sub else 0) <= 2 else 64)
        self.d.node(cx - w / 2, cy - h / 2, w, h, lines, sub=sub, kind=kind, rx=10)
        return dict(cx=cx, cy=cy, top=cy - h / 2, bot=cy + h / 2, l=cx - w / 2, r=cx + w / 2)

    def dec(self, cx, cy, lines, w=DW, h=DH):
        self.d.diamond(cx, cy, w, h, lines)
        return dict(cx=cx, cy=cy, top=cy - h / 2, bot=cy + h / 2, l=cx - w / 2, r=cx + w / 2)

    def mrg(self, cx, cy):
        self.d.merge(cx, cy)
        return dict(cx=cx, cy=cy, top=cy - 10, bot=cy + 10, l=cx - 10, r=cx + 10)

    def go(self, pts, label=None, lpos=None, color=MUTED, anchor='middle'):
        self.d.path(pts, color=color)
        if label:
            self.d.label(lpos[0], lpos[1], label, color=color, anchor=anchor)


def write(name, d, title, desc):
    open(os.path.join(OUT, name + '.html'), 'w', encoding='utf-8').write(d.html(name, EY, title, desc))


LEG = [('startend', 'Bắt đầu / kết thúc'), ('node', 'Hành động'), ('decision', 'Quyết định / hợp nhánh'),
       ('focal', 'Bước trọng tâm'), ('arrow', 'Luồng điều khiển')]


def a1():
    d = D(1000, 760); a = A(d)
    d.start(480, 48)
    n1 = a.act(480, 112, 'Người chơi chụp hoặc tải 1–5 ảnh', 'thư viện máy hoặc camera trong app')
    n2 = a.act(480, 208, 'AI agent đọc từng ảnh', 'Gemini → OpenRouter → NVIDIA', kind='focal')
    d1 = a.dec(480, 316, ['AI đọc', 'được ảnh?'])
    n3 = a.act(180, 316, 'Gõ tay tỉ số', 'vẫn kèm ảnh · tối đa Vàng', w=216)
    d2 = a.dec(480, 444, ['AI khớp cột', 'với tên đội?'])
    n4 = a.act(800, 444, 'Người khai tự chọn cột', 'tối đa Vàng', w=216)
    m1 = a.mrg(480, 548)
    n5 = a.act(480, 612, 'Gộp các set theo thứ tự', 'set nhiều ảnh: lấy ảnh chụp muộn nhất')
    a.go([(480, 55), (480, n1['top'])])
    a.go([(480, n1['bot']), (480, n2['top'])])
    a.go([(480, n2['bot']), (480, d1['top'])])
    a.go([(d1['l'], 316), (n3['r'], 316)], '[không]', (330, 302))
    a.go([(480, d1['bot']), (480, d2['top'])], '[có]', (508, 380))
    a.go([(d2['r'], 444), (n4['l'], 444)], '[không]', (638, 430))
    a.go([(480, d2['bot']), (480, m1['top'])], '[có]', (508, 508))
    a.go([(n3['cx'], n3['bot']), (n3['cx'], 548), (m1['l'], 548)])
    a.go([(n4['cx'], n4['bot']), (n4['cx'], 548), (m1['r'], 548)])
    a.go([(480, m1['bot']), (480, n5['top'])])
    a.go([(480, n5['bot']), (480, 671)], 'sang A2', (528, 654), anchor='middle')
    d.end(480, 680)
    d.legend(704, LEG)
    return d


def a2():
    d = D(1000, 880); a = A(d)
    d.start(440, 48)
    n1 = a.act(440, 112, 'Người khai xem bản điền sẵn, sửa nếu cần', 'ô đã sửa → tối đa Vàng · hiện số gốc', w=300)
    d1 = a.dec(440, 220, ['Hợp luật cầu lông', 'và đúng BO3/BO5?'], w=224)
    n2 = a.act(800, 220, 'Báo lỗi, yêu cầu sửa', 'RESULT_SCORE_INVALID', w=216)
    d2 = a.dec(440, 344, ['Có ảnh lạ?', 'trùng · chụp trước giờ'], w=224)
    r = a.act(150, 344, 'Mức ĐỎ', 'không bao giờ tự chốt', kind='focal', w=200)
    d3 = a.dec(440, 468, ['Có điều kiện', 'Vàng nào?'])
    y = a.act(760, 468, 'Mức VÀNG', 'cửa sổ 6h', w=200)
    g = a.act(440, 580, 'Mức XANH', 'cửa sổ 2h', w=200)
    m = a.mrg(440, 664)
    n3 = a.act(440, 732, 'Ghi bản khai bất biến', 'bản đầu của đội → kết quả đề xuất')
    a.go([(440, 55), (440, n1['top'])])
    a.go([(440, n1['bot']), (440, d1['top'])])
    a.go([(d1['r'], 220), (n2['l'], 220)], '[không]', (620, 206))
    a.go([(n2['cx'], n2['top']), (n2['cx'], 112), (n1['r'], 112)])
    a.go([(440, d1['bot']), (440, d2['top'])], '[có]', (468, 282))
    a.go([(d2['l'], 344), (r['r'], 344)], '[có]', (290, 330))
    a.go([(440, d2['bot']), (440, d3['top'])], '[không]', (476, 406))
    a.go([(d3['r'], 468), (y['l'], 468)], '[có]', (604, 454))
    a.go([(440, d3['bot']), (440, g['top'])], '[không]', (476, 528))
    a.go([(r['cx'], r['bot']), (r['cx'], 664), (m['l'], 664)])
    a.go([(y['cx'], y['bot']), (y['cx'], 664), (m['r'], 664)])
    a.go([(440, g['bot']), (440, m['top'])])
    a.go([(440, m['bot']), (440, n3['top'])])
    a.go([(440, n3['bot']), (440, 787)])
    d.end(440, 796)
    d.note(640, 684, 320, 108, ['Điều kiện Vàng: ô độ chắc < 0,9 · sửa ô ·', 'set gõ tay · ảnh không có / quá giờ chụp ·',
                               'ảnh gần trùng · nhiều bảng điểm ·', 'tự chọn cột · AI lỗi · uy tín Thấp.',
                               'Lý do Vàng không bao giờ nêu uy tín.', 'Đỏ: chỉ ảnh lạ (BR-RA-17).'])
    d.legend(820, LEG)
    return d


def a3a():
    d = D(1000, 820); a = A(d)
    d.start(480, 48)
    n1 = a.act(480, 112, 'Lập kết quả đề xuất, tính hạn', 'Xanh 2h · Vàng 6h · Đỏ 12h · giãn qua đêm', w=300)
    d1 = a.dec(480, 220, ['Mức Đỏ?'], w=160, h=72)
    n2 = a.act(800, 220, 'Admin xử hồ sơ', 'SLA 48h · ra kết quả cuối', kind='store', w=216)
    n3 = a.act(480, 320, 'Chờ phản hồi của đội kia')
    d2 = a.dec(480, 424, ['Điều gì', 'đến trước?'], w=176)
    n4 = a.act(180, 424, ['Xử lý đội thua', 'chấp nhận (A3b)'], w=216)
    d3 = a.dec(800, 424, ['Lý do', 'bất đồng?'], w=160)
    n6 = a.act(800, 560, 'Tranh chấp tỉ số (A4)', w=216)
    n5 = a.act(480, 560, 'Chốt kết quả', 'chia tiền tạm giữ · rating · điểm BXH', kind='focal')
    a.go([(480, 55), (480, n1['top'])])
    a.go([(480, n1['bot']), (480, d1['top'])])
    a.go([(d1['r'], 220), (n2['l'], 220)], '[có]', (634, 206))
    a.go([(480, d1['bot']), (480, n3['top'])], '[không]', (518, 274))
    a.go([(480, n3['bot']), (480, d2['top'])])
    a.go([(d2['l'], 424), (n4['r'], 424)], '[chấp nhận]', (344, 410))
    a.go([(d2['r'], 424), (d3['l'], 424)], '[bất đồng]', (634, 410))
    a.go([(480, d2['bot']), (480, n5['top'])], '[hết cửa sổ]', (536, 498))
    a.go([(800, d3['top']), (800, n2['bot'])], '[không có trận]', (858, 330))
    a.go([(800, d3['bot']), (800, n6['top'])], '[tỉ số sai]', (850, 498))
    a.go([(n4['cx'] - 24, n4['bot']), (n4['cx'] - 24, 560), (n5['l'], 560)], 'CHỐT', (236, 546))
    a.go([(n4['cx'] + 24, n4['bot']), (n4['cx'] + 24, 656), (800, 656), (800, n6['bot'])], 'phản đối', (620, 642))
    a.go([(480, n5['bot']), (480, 611)])
    d.end(480, 620)
    d.legend(760, LEG + [('store', 'Do Admin xử')])
    return d


def a3b():
    d = D(1000, 872); a = A(d)
    d.start(400, 48)
    d1 = a.dec(400, 140, ['Người chấp nhận là', 'partner được trả thay?'], w=240)
    d2 = a.dec(700, 140, ['Chủ kèo cũng', 'chấp nhận?'], w=176)
    n1 = a.act(900, 236, ['Chờ tiếp', 'cửa sổ thường'], w=144)
    m1 = a.mrg(400, 252)
    d3 = a.dec(400, 344, ['Kèo đơn', 'hay đôi?'], w=176)
    n2 = a.act(400, 456, 'Grace 1h cho người còn lại', 'giãn qua đêm nếu rơi 23:00–07:00')
    d4 = a.dec(400, 564, ['Người còn lại', 'phản hồi?'], w=176)
    n5 = a.act(720, 564, 'Tranh chấp tỉ số (A4)', w=216)
    m2 = a.mrg(400, 660)
    n4 = a.act(400, 724, 'Chốt kết quả', 'chia tiền tạm giữ · rating · điểm BXH', kind='focal')
    a.go([(400, 55), (400, d1['top'])])
    a.go([(d1['r'], 140), (d2['l'], 140)], '[có]', (552, 126))
    a.go([(d2['r'], 140), (900, 140), (900, n1['top'])], '[chưa]', (836, 126))
    a.go([(700, d2['bot']), (700, 252), (m1['r'], 252)], '[có]', (730, 214))
    a.go([(400, d1['bot']), (400, m1['top'])], '[không]', (436, 206))
    a.go([(900, n1['bot']), (900, 315)], 'về A3a', (944, 300))
    d.end(900, 324)
    a.go([(400, m1['bot']), (400, d3['top'])])
    a.go([(400, d3['bot']), (400, n2['top'])], '[đôi]', (428, 408))
    a.go([(d3['l'], 344), (160, 344), (160, 660), (m2['l'], 660)], '[đơn]', (240, 330))
    a.go([(400, n2['bot']), (400, d4['top'])])
    a.go([(d4['r'], 564), (n5['l'], 564)], '[phản đối]', (550, 550))
    a.go([(400, d4['bot']), (400, m2['top'])], '[chấp nhận / hết 1h]', (480, 628))
    a.go([(400, m2['bot']), (400, n4['top'])])
    d.end(400, 788)
    a.go([(400, n4['bot']), (400, 779)])
    d.legend(820 - 16, LEG)
    return d


def a4():
    d = D(1000, 920); a = A(d)
    d.start(440, 48)
    n1 = a.act(440, 112, 'Mở 2h nộp bằng chứng', 'ảnh mới giữ kín tới hết 2h hoặc Đã nộp đủ')
    n2 = a.act(440, 208, 'AI agent đọc các ảnh mới', 'thử lại tối đa 30 phút')
    d1 = a.dec(440, 312, ['Đọc được', 'hết ảnh mới?'], w=176)
    na = a.act(800, 312, 'Admin xử hồ sơ', 'SLA 48h', kind='store', w=200)
    n3 = a.act(440, 420, 'Xếp mức từng ảnh, loại ảnh lạ', 'gom ảnh Xanh/Vàng theo bên thắng ủng hộ', kind='focal', w=300)
    d2 = a.dec(440, 532, ['Bằng chứng hợp lệ', 'ủng hộ mấy bên?'], w=224)
    n5 = a.act(150, 532, ['Kết quả tạm:', 'Không có kết quả'], w=200)
    n6 = a.act(800, 532, ['Sang tầng 2', 'AI phán quyết (A5)'], w=200)
    n4 = a.act(440, 640, 'Kết quả tạm theo bên đó', w=232)
    m = a.mrg(440, 712)
    n7 = a.act(440, 768, ['Công bố kết quả tạm,', 'mở 6h kháng nghị (A5)'], w=232, h=56)
    a.go([(440, 55), (440, n1['top'])])
    a.go([(440, n1['bot']), (440, n2['top'])])
    a.go([(440, n2['bot']), (440, d1['top'])])
    a.go([(d1['r'], 312), (na['l'], 312)], '[không]', (614, 298))
    a.go([(440, d1['bot']), (440, n3['top'])], '[có]', (468, 374))
    a.go([(440, n3['bot']), (440, d2['top'])])
    a.go([(d2['l'], 532), (n5['r'], 532)], '[0 bên]', (290, 518))
    a.go([(d2['r'], 532), (n6['l'], 532)], '[≥ 2 bên]', (626, 518))
    a.go([(440, d2['bot']), (440, n4['top'])], '[1 bên]', (476, 594))
    a.go([(n5['cx'], n5['bot']), (n5['cx'], 712), (m['l'], 712)])
    a.go([(440, n4['bot']), (440, m['top'])])
    a.go([(440, m['bot']), (440, n7['top'])])
    a.go([(440, n7['bot']), (440, 819)])
    d.end(440, 828)
    a.go([(800, na['bot']), (800, 375)])
    d.end(800, 384)
    a.go([(800, n6['bot']), (800, 595)])
    d.end(800, 604)
    d.legend(860, LEG + [('store', 'Do Admin xử')])
    return d


def a5():
    d = D(1000, 940); a = A(d)
    d.start(440, 48)
    d.label(440 + 96, 48, 'từ A4 · ≥ 2 bên', anchor='middle')
    n1 = a.act(440, 120, 'AI agent soạn phán quyết tạm', 'chỉ văn bản bằng chứng + RAG luật/án lệ', kind='focal', w=300)
    d1 = a.dec(440, 228, ['Tin cậy ≥ 0,85', 'và đúng khuôn?'], w=208)
    n2 = a.act(440, 336, 'Công bố phán quyết tạm', 'kèm lý do và trích dẫn')
    d.start(160, 412)
    d.label(160, 388, 'từ A4 · kết quả tạm')
    m1 = a.mrg(440, 412)
    n3 = a.act(440, 476, 'Mở 6h kháng nghị', 'giãn qua đêm nếu rơi 23:00–07:00')
    d2 = a.dec(440, 588, ['Bên bị xử thua', 'làm gì?'], w=192)
    n4 = a.act(150, 588, ['Từ chối kháng nghị', 'thiếu căn cứ'], w=200)
    na = a.act(780, 588, 'Admin xử hồ sơ', 'SLA 48h · xác nhận hai bước', kind='store', w=232)
    m2 = a.mrg(440, 696)
    n5 = a.act(440, 768, 'Chốt kết quả cuối', 'tiền · rating · BXH · vi phạm · án lệ')
    a.go([(440, 55), (440, n1['top'])])
    a.go([(440, n1['bot']), (440, d1['top'])])
    a.go([(d1['r'], 228), (780, 228), (780, na['top'])], '[không / AI lỗi]', (680, 214))
    a.go([(440, d1['bot']), (440, n2['top'])], '[có]', (468, 290))
    a.go([(440, n2['bot']), (440, m1['top'])])
    a.go([(167, 412), (m1['l'], 412)])
    a.go([(440, m1['bot']), (440, n3['top'])])
    a.go([(440, n3['bot']), (440, d2['top'])])
    a.go([(d2['r'], 588), (na['l'], 588)], '[có căn cứ]', (600, 574))
    a.go([(d2['l'], 588), (n4['r'], 588)], '[thiếu căn cứ]', (296, 574))
    a.go([(n4['cx'], n4['top']), (n4['cx'], 476), (n3['l'], 476)])
    a.go([(440, d2['bot']), (440, m2['top'])], '[chấp nhận / hết 6h]', (520, 660))
    a.go([(na['cx'], na['bot']), (na['cx'], 696), (m2['r'], 696)])
    a.go([(440, m2['bot']), (440, n5['top'])])
    a.go([(440, n5['bot']), (440, 835)])
    d.end(440, 844)
    d.legend(872, LEG + [('store', 'Do Admin xử')])
    return d


if __name__ == '__main__':
    write('a1-khai-va-doc-anh', a1(), 'A1 — Khai kết quả và AI đọc ảnh',
          'Người chơi tải ảnh, AI agent đọc tỉ số với nguồn dự phòng, người khai gõ tay hoặc tự chọn cột khi AI không làm được, rồi hệ thống gộp các set.')
    write('a2-xep-muc-tin-cay', a2(), 'A2 — Xếp mức tin cậy của bản khai',
          'Bản khai được kiểm tra luật, ảnh lạ và các điều kiện Vàng để gán mức Đỏ, Vàng hoặc Xanh trước khi ghi thành kết quả đề xuất.')
    write('a3a-phan-hoi-ket-qua', a3a(), 'A3a — Phản hồi kết quả đề xuất',
          'Kết quả đề xuất được chốt khi hết cửa sổ, chuyển sang xử lý chấp nhận, tranh chấp hoặc Admin tuỳ mức tin cậy và phản hồi của đội kia.')
    write('a3b-doi-thua-chap-nhan', a3b(), 'A3b — Đội thua chấp nhận kết quả',
          'Chấp nhận của partner được trả thay cần chủ kèo đồng ý; kèo đơn chốt ngay, kèo đôi chờ người còn lại tối đa 1 giờ.')
    write('a4-tranh-chap-tang-1', a4(), 'A4 — Tranh chấp tầng 1: luật bằng chứng',
          'Hệ thống thu bằng chứng kín trong 2 giờ, AI đọc ảnh, xếp mức từng ảnh và ra kết quả tạm hoặc chuyển tầng 2 tuỳ số bên có bằng chứng hợp lệ.')
    write('a5-tang-2-va-khang-nghi', a5(), 'A5 — Tầng 2 và kháng nghị',
          'AI agent soạn phán quyết tạm với RAG; mọi kết quả tạm có 6 giờ kháng nghị, kháng nghị có căn cứ chuyển Admin, còn lại tự chốt.')
    print('ok')
