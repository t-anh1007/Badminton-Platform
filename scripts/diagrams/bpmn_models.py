import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from bpmn_gen import build

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'product', 'diagrams', 'result-ocr')

# ---------------- AS-IS: luồng khai kết quả / tranh chấp hiện tại ----------------
lanes = [('L_ck', 'Chủ kèo', 1), ('L_dt', 'Người chơi còn lại', 1), ('L_ht', 'Hệ thống', 2),
         ('L_cs', 'Chủ sân', 1), ('L_ad', 'Admin', 1)]
N = {
    'S': ('startEvent', 'Hết giờ sân', 'L_ht', 0, 0, 'timer'),
    'T1': ('serviceTask', 'Mở cửa sổ khai 12h, nhắc chủ kèo', 'L_ht', 0, 1, None),
    'T2': ('userTask', 'Nhập tỉ số từng set kèm 1–3 ảnh', 'L_ck', 0, 2, None),
    'T3': ('serviceTask', 'Mở 12h phản hồi, báo đối thủ', 'L_ht', 0, 3, None),
    'T4': ('userTask', 'Xem kết quả: Đồng ý hoặc Phản đối', 'L_dt', 0, 4, None),
    'G1': ('exclusiveGateway', 'Phản hồi?', 'L_ht', 0, 5, None),
    'T5': ('serviceTask', 'Khóa tiền tạm giữ và điểm, mở tranh chấp', 'L_ht', 1, 5, None),
    'T6': ('userTask', 'Xem bằng chứng, đề xuất kết quả (24h)', 'L_cs', 0, 6, None),
    'T7': ('userTask', 'Quyết định kết quả (SLA 48h), xác nhận 2 bước', 'L_ad', 0, 7, None),
    'GM': ('exclusiveGateway', '', 'L_ht', 0, 8, None),
    'T9': ('serviceTask', 'Chia tiền tạm giữ, cập nhật rating và BXH', 'L_ht', 0, 9, None),
    'E1': ('endEvent', 'Kết quả final', 'L_ht', 0, 10, None),
    'T8': ('serviceTask', 'Tạm Không có kết quả, mở 12h báo sự cố', 'L_ht', 1, 3, None),
    'E2': ('endEvent', 'Final Không có kết quả (50:50)', 'L_ht', 1, 4, None),
}
B = {
    'B1': ('T2', 'timer', 'Hết 12h không khai'),
    'B2': ('T4', 'timer', 'Hết 12h không phản hồi'),
    'B3': ('T6', 'timer', 'Hết 24h'),
}
F = [
    ('f1', 'S', 'T1', ''), ('f2', 'T1', 'T2', ''), ('f3', 'T2', 'T3', ''), ('f4', 'T3', 'T4', ''),
    ('f5', 'T4', 'G1', ''), ('f6', 'G1', 'GM', 'Đồng ý'), ('f7', 'G1', 'T5', 'Phản đối'),
    ('f8', 'T5', 'T6', ''), ('f9', 'T6', 'T7', ''), ('f10', 'T7', 'GM', ''),
    ('f11', 'GM', 'T9', ''), ('f12', 'T9', 'E1', ''),
    ('f13', 'B1', 'T8', ''), ('f14', 'T8', 'E2', ''), ('f15', 'B2', 'GM', ''), ('f16', 'B3', 'T7', ''),
]
build('Proc_AsIs', 'AS-IS — Khai kết quả kèo và tranh chấp (hiện tại)', lanes, N, B, F,
      os.path.join(OUT, '02-bpmn-as-is.bpmn'))

from bpmn_models_tobe import *  # noqa
