import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from bpmn_gen import build

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr')

# ---------------- TO-BE: luồng chính (tranh chấp là tiến trình con) ----------------
lanes = [('L_nk', 'Người chơi đội đề xuất', 1), ('L_dc', 'Người chơi đội còn lại', 1),
         ('L_ht', 'Hệ thống', 3), ('L_ai', 'AI agent', 1), ('L_ad', 'Admin', 1)]
N = {
    'S': ('startEvent', 'Hết giờ sân', 'L_ht', 0, 0, 'timer'),
    'T1': ('serviceTask', 'Mở cửa sổ khai 12h, nhắc cả roster', 'L_ht', 0, 1, None),
    'T2': ('userTask', 'Chụp hoặc tải ảnh bảng tỉ số', 'L_nk', 0, 2, None),
    'T2b': ('serviceTask', 'Tạm Không có kết quả, mở 12h báo sự cố', 'L_ht', 2, 2, None),
    'E2': ('endEvent', 'Final Không có kết quả (50:50)', 'L_ht', 2, 3, None),
    'T3': ('serviceTask', 'Đọc ảnh: tỉ số, cột, độ chắc', 'L_ai', 0, 4, None),
    'T4': ('businessRuleTask', 'Kiểm tra luật, giờ chụp, trùng ảnh; xếp mức', 'L_ht', 0, 5, None),
    'T5': ('userTask', 'Xác nhận hoặc sửa, bấm Gửi', 'L_nk', 0, 6, None),
    'T6': ('serviceTask', 'Lập kết quả đề xuất, mở cửa sổ theo mức', 'L_ht', 0, 7, None),
    'G1': ('exclusiveGateway', 'Mức Đỏ (ảnh lạ)?', 'L_ht', 0, 8, None),
    'T7': ('userTask', 'Phản hồi kết quả đề xuất', 'L_dc', 0, 9, None),
    'G2': ('exclusiveGateway', 'Phản hồi?', 'L_ht', 0, 10, None),
    'SP': ('subProcess', 'Tranh chấp tỉ số (xem 03b)', 'L_ht', 1, 11, None),
    'TA': ('userTask', 'Xử hồ sơ, ra kết quả cuối (SLA 48h)', 'L_ad', 0, 12, None),
    'GF': ('exclusiveGateway', '', 'L_ht', 0, 13, None),
    'TF': ('serviceTask', 'Chốt: chia tiền tạm giữ, rating, điểm BXH', 'L_ht', 0, 14, None),
    'E1': ('endEvent', 'Kết quả final', 'L_ht', 0, 15, None),
}
B = {
    'B1': ('T2', 'timer', 'Hết 12h không ai khai'),
    'B2': ('T7', 'timer', 'Hết cửa sổ 2h/6h/12h'),
}
F = [
    ('f1', 'S', 'T1', ''), ('f2', 'T1', 'T2', ''), ('f3', 'T2', 'T3', ''), ('f4', 'T3', 'T4', ''),
    ('f5', 'T4', 'T5', ''), ('f6', 'T5', 'T6', ''), ('f7', 'T6', 'G1', ''),
    ('f8', 'G1', 'TA', 'Có'), ('f9', 'G1', 'T7', 'Không'),
    ('f10', 'T7', 'G2', ''), ('f11', 'G2', 'GF', 'Đội thua chấp nhận (1 người)'),
    ('f12', 'G2', 'SP', 'Bất đồng: tỉ số sai'), ('f13', 'G2', 'TA', 'Sự cố'),
    ('f19', 'SP', 'GF', 'Kết quả cuối'), ('f20', 'TA', 'GF', ''),
    ('f21', 'GF', 'TF', ''), ('f22', 'TF', 'E1', ''),
    ('f23', 'B1', 'T2b', ''), ('f24', 'T2b', 'E2', ''),
    ('f25', 'B2', 'GF', ''),
]
build('Proc_ToBe', 'TO-BE — Quét ảnh tỉ số, tự chốt kết quả', lanes, N, B, F,
      os.path.join(OUT, '03-bpmn-to-be.bpmn'))

# ---------------- TO-BE: tiến trình con Tranh chấp tỉ số ----------------
lanes = [('L_pl', 'Người chơi hai đội', 1), ('L_ht', 'Hệ thống', 2), ('L_ai', 'AI agent', 1), ('L_ad', 'Admin', 1)]
N = {
    'S': ('startEvent', 'Bất đồng tỉ số', 'L_ht', 0, 0, None),
    'T10': ('serviceTask', 'Mở 2h nộp bằng chứng (giữ kín)', 'L_ht', 0, 1, None),
    'T11': ('userTask', 'Nộp ảnh bằng chứng', 'L_pl', 0, 2, None),
    'IT1': ('intermediateCatchEvent', 'Hết 2h hoặc đã nộp đủ', 'L_ht', 0, 3, 'timer'),
    'T12': ('serviceTask', 'Đọc ảnh bằng chứng', 'L_ai', 0, 4, None),
    'GX': ('exclusiveGateway', 'Đọc được hết?', 'L_ht', 0, 5, None),
    'T13': ('businessRuleTask', 'Tầng 1: gom bằng chứng theo bên thắng', 'L_ht', 0, 6, None),
    'G5': ('exclusiveGateway', 'Ủng hộ mấy bên?', 'L_ht', 0, 7, None),
    'T14': ('serviceTask', 'Tầng 2: phán quyết tạm (RAG luật + án lệ)', 'L_ai', 0, 8, None),
    'G6': ('exclusiveGateway', 'Tin cậy ≥ 0,85?', 'L_ht', 1, 9, None),
    'GM2': ('exclusiveGateway', '', 'L_ht', 0, 10, None),
    'T15': ('serviceTask', 'Công bố kết quả tạm, mở 6h kháng nghị', 'L_ht', 0, 11, None),
    'T16': ('userTask', 'Bên bị xử thua: chấp nhận hoặc kháng nghị', 'L_pl', 0, 12, None),
    'G7': ('exclusiveGateway', 'Kháng nghị có căn cứ?', 'L_ht', 0, 13, None),
    'TA': ('userTask', 'Xử hồ sơ, ra kết quả cuối (SLA 48h)', 'L_ad', 0, 14, None),
    'GE': ('exclusiveGateway', '', 'L_ht', 0, 15, None),
    'E': ('endEvent', 'Có kết quả cuối', 'L_ht', 0, 16, None),
}
B = {'B4': ('T16', 'timer', 'Hết 6h')}
F = [
    ('f1', 'S', 'T10', ''), ('f2', 'T10', 'T11', ''), ('f3', 'T11', 'IT1', ''), ('f4', 'IT1', 'T12', ''),
    ('f5', 'T12', 'GX', ''), ('f6', 'GX', 'T13', 'Có'), ('f7', 'GX', 'TA', 'Không'),
    ('f8', 'T13', 'G5', ''), ('f9', 'G5', 'GM2', '0 hoặc 1 bên'), ('f10', 'G5', 'T14', 'Hai bên trở lên'),
    ('f11', 'T14', 'G6', ''), ('f12', 'G6', 'GM2', 'Có'), ('f13', 'G6', 'TA', 'Không / AI lỗi'),
    ('f14', 'GM2', 'T15', ''), ('f15', 'T15', 'T16', ''), ('f16', 'T16', 'G7', ''),
    ('f17', 'G7', 'GE', 'Không / chấp nhận'), ('f18', 'G7', 'TA', 'Có'),
    ('f19', 'TA', 'GE', ''), ('f20', 'GE', 'E', ''), ('f21', 'B4', 'GE', ''),
]
build('Proc_ToBe_Dispute', 'TO-BE — Tiến trình con: Tranh chấp tỉ số hai tầng', lanes, N, B, F,
      os.path.join(OUT, '03b-bpmn-to-be-tranh-chap.bpmn'))
