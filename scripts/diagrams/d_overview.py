"""O1 — Sơ đồ tổng quan TO-BE một trang để trình bày (swimlane, bước đánh số).

Gộp luồng chính 03 và tranh chấp hai tầng 03b; đã áp D63 (đội thua chấp nhận một
người là chốt, không còn grace kèo đôi).
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ddlib import D, MUTED, ACCENT, INK, SANS, MONO, esc

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr', 'html')
NW, NH = 170, 56

d = D(1960, 860)
LX, LW, HDR = 40, 1900, 120
LANES = [('Người khai', 'đội đề xuất', 40, 160), ('Đội còn lại', 'đội kia', 160, 280),
         ('Hệ thống', 'code + luật', 280, 480), ('AI agent', 'đọc ảnh · RAG', 480, 600),
         ('Admin', 'quyền cuối', 600, 720)]
for i, (name, sub, y0, y1) in enumerate(LANES):
    ai = name == 'AI agent'
    fill = 'rgba(191,69,32,0.05)' if ai else ('rgba(45,49,66,0.025)' if i % 2 else 'transparent')
    d.back.append(f'<rect x="{LX}" y="{y0}" width="{LW}" height="{y1 - y0}" fill="{fill}" stroke="rgba(45,49,66,0.14)" stroke-width="1"/>')
    d.back.append(f'<line x1="{LX + HDR}" y1="{y0}" x2="{LX + HDR}" y2="{y1}" stroke="rgba(45,49,66,0.14)" stroke-width="1"/>')
    cy = (y0 + y1) / 2
    col = ACCENT if ai else INK
    d.back.append(f'<text x="{LX + HDR / 2}" y="{cy - 2}" fill="{col}" font-size="14" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(name)}</text>')
    d.back.append(f'<text x="{LX + HDR / 2}" y="{cy + 14}" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="middle">{esc(sub)}</text>')


def badge(cx, cy, n):
    d.front.append(f'<circle cx="{cx}" cy="{cy}" r="11" fill="{ACCENT}" stroke="#f5f5f5" stroke-width="2"/>')
    d.front.append(f'<text x="{cx}" y="{cy + 4}" fill="#ffffff" font-size="11" font-weight="600" font-family="{SANS}" text-anchor="middle">{n}</text>')


def box(cx, cy, lines, sub=None, kind='backend', n=None, w=NW, h=NH):
    d.node(cx - w / 2, cy - h / 2, w, h, lines, sub=sub, kind=kind, rx=10)
    if n:
        badge(cx - w / 2 + 2, cy - h / 2 + 2, n)


def go(pts, label=None, at=None, color=MUTED):
    d.path(pts, color=color)
    if label:
        d.label(at[0], at[1], label, color=color)


# Vùng tranh chấp (vẽ trước để nằm dưới node)
d.zone(1250, 374, 470, 218, 'Tranh chấp tỉ số · hai tầng')

# 1–5: khai kết quả
d.start(202, 330)
d.front.append(f'<text x="202" y="356" fill="{MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle">HẾT GIỜ SÂN</text>')
box(320, 330, 'Mở cửa sổ khai 12h', 'nhắc cả hai đội', n=1)
box(500, 100, ['Chụp / tải ảnh', 'bảng tỉ số'], n=2)
box(500, 540, 'AI đọc ảnh', 'tỉ số · cột đội · độ chắc', kind='focal', n=3)
box(680, 330, ['Kiểm luật, giờ chụp,', 'trùng ảnh'], 'xếp Xanh / Vàng / Đỏ', n=4, h=64)
box(680, 100, ['Xác nhận hoặc sửa', '→ Gửi'], n=5)
box(860, 330, 'Lập kết quả đề xuất', 'chờ 2h · 6h · 12h')
d.diamond(1040, 330, 120, 72, ['Ảnh lạ?', '(mức Đỏ)'])

# Nhánh không ai khai
box(320, 430, ['Tạm Không có KQ', 'mở 12h báo sự cố'], h=52)
d.end(450, 430)
d.front.append(f'<text x="450" y="458" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="middle">FINAL 50:50</text>')

# 6: đội kia phản hồi
box(1040, 220, ['Xem kết quả đề xuất'], 'đồng ý · phản đối · im lặng', n=6)
d.diamond(1220, 220, 120, 72, 'Phản hồi?')
d.diamond(1220, 330, 120, 72, ['Phản đối', 'vì?'])

# 7–8: tranh chấp hai tầng
box(1350, 430, 'Tầng 1 · luật', '2h nộp ảnh · gom theo bên', n=7)
box(1350, 540, 'Tầng 2 · AI + RAG', 'tra luật, án lệ → phán quyết', kind='focal', n=8)
box(1620, 430, 'Kết quả tạm', '6h kháng nghị')

# 9–10: Admin, chốt
d.node(980, 632, 720, 56, 'Admin xử hồ sơ, ra quyết định cuối', sub='SLA 48h · xem cả phân tích của AI', rx=10)
badge(982, 634, 9)
box(1790, 330, 'Chốt kết quả', 'chia tiền · rating · BXH', n=10, w=150)
d.end(1910, 330)

# Luồng chính
go([(209, 330), (235, 330)])
go([(320, 302), (320, 100), (415, 100)])
go([(500, 128), (500, 512)])
go([(585, 540), (680, 540), (680, 362)])
go([(680, 298), (680, 128)])
go([(765, 100), (860, 100), (860, 302)])
go([(945, 330), (980, 330)])
go([(320, 358), (320, 404)], 'hết 12h không ai khai', (320, 381))
go([(405, 430), (441, 430)])
go([(1040, 294), (1040, 248)], 'không', (1040, 271))
go([(1040, 366), (1040, 632)], 'có · Đỏ', (1040, 400))
go([(1125, 220), (1160, 220)])
go([(1280, 220), (1790, 220), (1790, 302)], 'đồng ý (1 người đội thua) · hoặc hết giờ chờ', (1530, 220), color=ACCENT)
go([(1220, 256), (1220, 294)], 'phản đối', (1220, 275))
go([(1160, 330), (1130, 330), (1130, 632)], 'sự cố', (1130, 500))
go([(1220, 366), (1220, 430), (1265, 430)], 'tỉ số sai', (1220, 400))
go([(1435, 430), (1535, 430)], '0–1 bên có ảnh', (1485, 416))
go([(1350, 458), (1350, 512)], 'cả 2 bên có ảnh', (1350, 485))
go([(1435, 540), (1580, 540), (1580, 458)], 'tin cậy ≥ 0,85', (1505, 540))
go([(1350, 568), (1350, 632)], 'thấp / lỗi', (1350, 606))
go([(1680, 458), (1680, 632)], 'kháng nghị', (1680, 606))
go([(1620, 402), (1620, 330), (1715, 330)], 'chấp nhận / hết 6h', (1650, 366))
go([(1700, 660), (1790, 660), (1790, 358)])
go([(1865, 330), (1901, 330)])

# Chú giải + thông điệp chính
d.legend(748, [('node', 'Bước do người / code làm'), ('focal', 'Bước AI làm'), ('decision', 'Rẽ nhánh'),
               ('startend', 'Bắt đầu / kết thúc'), ('accent-arrow', 'Đường chốt nhanh')])
d.front.append(f'<circle cx="790" cy="781" r="8" fill="{ACCENT}"/><text x="790" y="784.5" fill="#fff" font-size="9" font-weight="600" font-family="{SANS}" text-anchor="middle">1</text>')
d.front.append(f'<text x="806" y="784" fill="{MUTED}" font-size="9.5" font-family="{SANS}">Thứ tự trình bày</text>')
d.callout(40, 826, 'AI chỉ đọc ảnh và gợi ý phán quyết tạm · luật do code giữ · tiền chỉ chia sau khi chốt · Admin giữ quyền cuối.')

open(os.path.join(OUT, 'o1-tong-quan-to-be.html'), 'w', encoding='utf-8').write(
    d.html('o1-tong-quan-to-be', 'Tổng quan · TO-BE · Kết quả kèo',
           'Luồng chốt kết quả kèo có AI agent',
           'Từ hết giờ sân tới chốt kết quả: AI đọc ảnh tỉ số, code xếp mức tin cậy, đội kia phản hồi, '
           'tranh chấp hai tầng (luật rồi AI + RAG), Admin phúc thẩm, hệ thống chia tiền.'))
print('wrote o1-tong-quan-to-be.html')
