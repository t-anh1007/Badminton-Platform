import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ddlib import D, INK, MUTED, ACCENT

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr', 'html')
os.makedirs(OUT, exist_ok=True)
EY = 'Use case · UML · Kết quả kèo'


def assoc(d, pts):
    d.path(pts, color=INK, arrow=False, width=1)


def dep(d, pts, text, lx, ly, anchor='middle'):
    d.path(pts, color=MUTED, dashed=True, marker='arrow-open')
    d.label(lx, ly, text, upper=False, anchor=anchor)


def uc1():
    d = D(1000, 520)
    d.boundary(160, 48, 680, 368, 'Hệ thống kết quả kèo')
    U1 = (400, 150, 120, 34)
    U2 = (690, 150, 112, 30)
    U3 = (690, 268, 112, 34)
    U4 = (284, 348, 100, 34)
    U5 = (556, 356, 112, 34)
    assoc(d, [(108, 150), (U1[0] - U1[2], 150)])
    assoc(d, [(U2[0] + U2[2], 150), (892, 150)])
    dep(d, [(U1[0] + U1[2], 150), (U2[0] - U2[2], 150)], '«include»', 549, 136)
    x3 = 488
    dep(d, [(x3, D.ey(150, 120, 34, 400, x3, top=False)), (x3, 268), (U3[0] - U3[2], 268)], '«include»', 533, 254)
    x4 = 312
    dep(d, [(x4, D.ey(U4[1], U4[2], U4[3], U4[0], x4)), (x4, D.ey(150, 120, 34, 400, x4, top=False))], '«extend»', x4 - 10, 252, anchor='end')
    x5 = 444
    dep(d, [(x5, D.ey(U5[1], U5[2], U5[3], U5[0], x5)), (x5, D.ey(150, 120, 34, 400, x5, top=False))], '«extend»', x5 - 10, 300, anchor='end')

    d.usecase(*U1, ['Khai kết quả bằng ảnh'], kind='focal', code='UC01')
    d.usecase(*U2, ['Đọc ảnh tỉ số'], code='UC02')
    d.usecase(*U3, ['Xếp mức tin cậy'], code='UC03', sub='Xanh · Vàng · Đỏ')
    d.usecase(*U4, ['Gõ tay tỉ số'], code='UC04', sub='khi AI lỗi')
    d.usecase(*U5, ['Chọn cột cho đội'], code='UC05', sub='khi AI không khớp tên')
    d.actor(80, 122, ['Người chơi', 'trong roster'])
    d.actor(920, 122, ['AI agent', 'đọc ảnh'])
    d.legend(444, [('actor', 'Tác nhân'), ('usecase', 'Ca sử dụng'), ('focal', 'Ca sử dụng chính'),
                   ('line', 'Liên kết tác nhân'), ('include', '«include» / «extend»')])
    return d


def uc2():
    d = D(1000, 740)
    d.boundary(200, 56, 720, 592, 'Hệ thống kết quả kèo')
    X, RX = 420, 124
    rows = {'06': 110, '08': 190, '09': 270, '10': 350, '11': 430, '12': 510, '07': 588}
    # Người chơi: fan 6 liên kết
    ports = {'06': 284, '08': 296, '09': 308, '10': 320, '11': 332, '12': 344}
    xs = {'06': 152, '08': 164, '09': 176, '10': 176, '11': 164, '12': 152}
    for k in ['06', '08', '09', '10', '11', '12']:
        assoc(d, [(112, ports[k]), (xs[k], ports[k]), (xs[k], rows[k]), (X - RX, rows[k])])
    # Chủ kèo -> UC07
    assoc(d, [(112, 588), (X - RX, 588)])
    # Tổng quát hoá Chủ kèo -> Người chơi
    d.path([(96, 556), (96, 392)], color=INK, marker='arrow-gen', width=1)
    # extend UC08 -> UC06
    x8 = 360
    dep(d, [(x8, D.ey(190, RX, 30, X, x8)), (x8, D.ey(110, RX, 34, X, x8, top=False))], '«extend»', x8 - 10, 152, anchor='end')
    # include UC09 -> UC02 (tham chiếu)
    dep(d, [(X + RX, 270), (680, 270)], '«include»', 612, 256)
    # extend UC07 -> UC06 (vòng phải)
    dep(d, [(X + RX, 588), (884, 588), (884, 110), (X + RX, 110)], '«extend»', 864, 430, anchor='end')
    d.usecase(X, 110, RX, 34, ['Phản hồi kết quả đề xuất'], kind='focal', code='UC06', sub='Đồng ý · Phản đối')
    d.usecase(X, 190, RX, 30, ['Báo sự cố'], code='UC08', sub='không có trận · vắng · bỏ dở')
    d.usecase(X, 270, RX, 30, ['Nộp bằng chứng tranh chấp'], code='UC09')
    d.usecase(X, 350, RX, 30, ['Kháng nghị'], code='UC10', sub='bên bị xử thua, có căn cứ')
    d.usecase(X, 430, RX, 30, ['Chấp nhận phán quyết'], code='UC11')
    d.usecase(X, 510, RX, 30, ['Xem uy tín của mình'], code='UC12')
    d.usecase(X, 588, RX, 32, ['Chấp nhận thay'], code='UC07', sub='khi partner được trả thay')
    d.usecase(780, 270, 100, 28, ['Đọc ảnh tỉ số'], kind='optional', code='UC02 · xem UC1')
    d.actor(96, 282, ['Người chơi'])
    d.actor(96, 560, ['Chủ kèo', 'người trả slot'])
    d.legend(668, [('actor', 'Tác nhân'), ('usecase', 'Ca sử dụng'), ('focal', 'Ca sử dụng chính'),
                   ('line', 'Liên kết'), ('include', '«include» / «extend»'), ('gen', 'Tổng quát hoá')])
    return d


def uc3():
    d = D(1000, 640)
    d.boundary(200, 48, 640, 500, 'Hệ thống kết quả kèo')
    X, RX = 420, 128
    # Bộ hẹn giờ -> UC13, UC14
    assoc(d, [(112, 172), (152, 172), (152, 120), (X - RX, 120)])
    assoc(d, [(112, 184), (152 + 12, 184), (164, 240), (X - RX, 240)])
    # AI -> UC15 ; Admin -> UC16
    assoc(d, [(800, 240), (888, 240)])
    assoc(d, [(X + RX, 400), (888, 400)])
    # include UC14 -> UC02 (ref)
    x14 = 500
    dep(d, [(x14, D.ey(240, RX, 34, X, x14, top=False)), (x14, 330), (620, 330)], '«include»', 560, 316)
    # extend UC15 -> UC14
    dep(d, [(600, 240), (X + RX, 240)], '«extend»', 574, 226)
    # extend UC17 -> UC16
    x17 = 420
    dep(d, [(x17, 480 - 30), (x17, 400 + 32)], '«extend»', x17 - 10, 441, anchor='end')
    d.usecase(X, 120, RX, 30, ['Tự chốt kết quả khi hết hạn'], code='UC13')
    d.usecase(X, 240, RX, 34, ['Xử tranh chấp tầng 1'], kind='focal', code='UC14', sub='luật bằng chứng')
    d.usecase(700, 240, 100, 34, ['Phán quyết tạm', 'tầng 2'], code='UC15', sub='RAG luật + án lệ')
    d.usecase(720, 330, 100, 28, ['Đọc ảnh tỉ số'], kind='optional', code='UC02 · xem UC1')
    d.usecase(X, 400, RX, 32, ['Xử hồ sơ'], code='UC16', sub='ảnh lạ · kháng nghị · sự cố')
    d.usecase(X, 480, RX, 30, ['Đánh dấu kháng nghị', 'không có căn cứ'], code='UC17')
    d.actor(96, 150, ['Bộ hẹn giờ', 'hệ thống'])
    d.actor(904, 212, ['AI agent', 'phán quyết'])
    d.actor(904, 372, ['Admin'])
    d.legend(572, [('actor', 'Tác nhân'), ('usecase', 'Ca sử dụng'), ('focal', 'Ca sử dụng chính'),
                   ('line', 'Liên kết'), ('include', '«include» / «extend»'), ('external', 'Ca sử dụng ở sơ đồ khác')])
    return d


def write(name, d, title, desc):
    open(os.path.join(OUT, name + '.html'), 'w', encoding='utf-8').write(d.html(name, EY, title, desc))


write('uc-1-khai-ket-qua', uc1(), 'Use case 1 — Khai kết quả bằng ảnh',
      'Người chơi khai kết quả bằng ảnh; ca sử dụng này luôn gọi AI đọc ảnh và xếp mức tin cậy, mở rộng sang gõ tay hoặc chọn cột khi AI không đọc hoặc không khớp tên được.')
write('uc-2-phan-hoi-tranh-chap', uc2(), 'Use case 2 — Phản hồi, tranh chấp và kháng nghị',
      'Người chơi phản hồi kết quả đề xuất, báo sự cố, nộp bằng chứng, kháng nghị hoặc chấp nhận phán quyết; chủ kèo chấp nhận thay khi partner được trả thay.')
write('uc-3-tu-dong-va-quan-tri', uc3(), 'Use case 3 — Xử lý tự động và quản trị',
      'Bộ hẹn giờ tự chốt kết quả và xử tranh chấp tầng 1, AI agent ra phán quyết tạm tầng 2, Admin xử hồ sơ và đánh dấu kháng nghị không căn cứ.')
print('ok')
