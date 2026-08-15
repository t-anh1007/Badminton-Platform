---
type: functional-spec
module: ai
phase: 2
status: draft-for-po-review
author: Claude Code
updated: 2026-08-07
source: docs/SCOPE_BASELINE.md §2.7, docs/product/phasing.md §4
provider: Google Gemini API (PO chốt 2026-08-07)
---

# Functional Spec — `ai` (AI-01, AI-02)

2 UC AI, Giai đoạn 2. Nền tích hợp: `packages/ai` (đã có skeleton). Provider: **Google Gemini API**.

> **Trạng thái: draft chờ PO duyệt.** Ràng buộc bất biến **#8: AI CHỈ hỗ trợ và giải thích, KHÔNG
> tự thực hiện hành động nhạy cảm** (đặt sân/kèo, thu/hoàn phí, khóa tài khoản, gỡ nội dung, đổi
> giá). Mọi đầu ra AI là gợi ý cho người dùng quyết định.

## 1. Actor & nguyên tắc

| Actor | Vai | Phạm vi |
|---|---|---|
| Người chơi | `player` | AI-01 (gợi ý kèo), AI-02 (chatbot hỗ trợ) |
| AI (Gemini) | hệ thống nội bộ | Chỉ sinh gợi ý/giải thích/trả lời; không có quyền hành động |

**Nguyên tắc bất biến #8 (bắt buộc kiểm chứng):** không tồn tại đường code nào để AI tự gọi API
hành động nhạy cảm. AI trả về **văn bản gợi ý/giải thích** + (AI-01) danh sách ứng viên có điểm;
người dùng bấm nút để thực hiện qua luồng nghiệp vụ chuẩn (MMP/BOK/FIN).

## 2. Tích hợp Gemini (D-P2-6)

| Khía cạnh | Quyết định |
|---|---|
| Provider | Google Gemini API |
| Vị trí gọi | `packages/ai` — một client Gemini dùng chung; các service gọi qua interface nội bộ, KHÔNG rải key khắp nơi |
| Credential | `GEMINI_API_KEY` qua env; **không hardcode**, không commit key |
| Model | 【PO-REVIEW: model cụ thể, ví dụ `gemini-2.x-flash` cho rẻ/nhanh】 |
| Fallback | Khi Gemini lỗi/hết quota: AI-01 rơi về gợi ý **thuần thuật toán F-02** (không LLM) + nhãn "giải thích rút gọn"; AI-02 trả thông báo "trợ lý tạm bận, thử lại sau", KHÔNG chặn nghiệp vụ chính |
| Chi phí | Đồ án free-tier: cache prompt/kết quả khi hợp lý; giới hạn tần suất mỗi user 【PO-REVIEW】 |
| Riêng tư | KHÔNG gửi dữ liệu người dùng khác vào prompt của một user; chỉ dữ liệu của chính user + dữ liệu công khai (xem AI-02) |

## 3. AI-01 — Nhận gợi ý kèo phù hợp (AI Matchmaker, có giải thích)

- **Actor**: người chơi. **Điều kiện**: đã đăng nhập, có Passport (ít nhất đã khai báo trình độ MMP-09).
- **Mô hình**: hệ thống lấy các kèo `open` phù hợp khung giờ/khu vực của user → tính **điểm độ hợp
  F-02** (rating/khoảng cách/thời gian) → gửi top ứng viên + dữ kiện vào Gemini để sinh **giải
  thích tự nhiên, có căn cứ** cho từng gợi ý ("Kèo này hợp vì cùng bậc TB+, cách bạn 2km, tối thứ 5
  bạn hay rảnh"). Trả danh sách xếp hạng + giải thích.
- **Nâng cấp bởi F-02**: điểm số đến từ F-02 (deterministic); Gemini chỉ **diễn giải**, không tự
  bịa điểm. Nếu Gemini và F-02 mâu thuẫn → tin F-02 (điểm là nguồn sự thật).
- **Bất biến #8**: AI-01 KHÔNG tự gửi yêu cầu tham gia kèo; chỉ hiển thị + nút "Tham gia" dẫn vào
  MMP-04.

**AC**
- `AC-AI-01-1` — Given player có Passport và có 3 kèo open phù hợp, When mở gợi ý, Then nhận danh sách xếp theo điểm độ hợp F-02, mỗi kèo kèm giải thích văn bản.
- `AC-AI-01-2` — Given mỗi gợi ý, When kiểm tra, Then LUÔN có giải thích nêu lý do cụ thể (không gợi ý "trần trụi" — ràng buộc AI phải giải thích).
- `AC-AI-01-3` — Given Gemini lỗi/hết quota, When lấy gợi ý, Then vẫn trả danh sách theo điểm F-02 với giải thích rút gọn (fallback), không lỗi trắng màn hình.
- `AC-AI-01-4` — Given một gợi ý, When player muốn tham gia, Then đi qua luồng MMP-04 chuẩn — AI KHÔNG tự tạo JOIN (bất biến #8).
- `AC-AI-01-5` — Given prompt gửi Gemini, When kiểm tra, Then KHÔNG chứa dữ liệu nhạy cảm của player khác (chỉ dữ kiện kèo công khai + hồ sơ của chính user).

## 4. AI-02 — Nhận hỗ trợ từ chatbot (RAG trên chính sách + dữ liệu của chính user)

- **Actor**: người chơi. **Mô hình RAG (D-P2-5)**: nguồn tri thức = (a) **chính sách/tài liệu công
  khai** của nền tảng (hủy/hoàn tiền, cách đặt sân, luật kèo — seed từ docs), và (b) **dữ liệu của
  CHÍNH user** (booking, ví, kèo, ticket của họ). Truy hồi ngữ cảnh liên quan → đưa vào prompt
  Gemini → trả lời có dẫn nguồn. TUYỆT ĐỐI không truy hồi dữ liệu user khác.
- **Bất biến #8**: chatbot KHÔNG tự hủy booking/hoàn tiền/mở tranh chấp; nếu user yêu cầu hành
  động, bot hướng dẫn + dẫn tới nút/luồng nghiệp vụ chuẩn.
- **Ngoài phạm vi**: 4 AI đã loại (Smart Court Rec, AI moderation, Revenue Analysis, Ops Assistant).

**AC**
- `AC-AI-02-1` — Given user hỏi "chính sách hủy sân thế nào", When chatbot trả lời, Then câu trả lời dựa trên tài liệu chính sách (RAG) và đúng nội dung BR-BOK-05.
- `AC-AI-02-2` — Given user hỏi "booking gần nhất của tôi khi nào", When trả lời, Then dùng dữ liệu của CHÍNH user, trả đúng.
- `AC-AI-02-3` — Given user A hỏi về dữ liệu của user B, When xử lý, Then bot KHÔNG truy hồi/không tiết lộ dữ liệu user B (chỉ dữ liệu của A + công khai).
- `AC-AI-02-4` — Given user yêu cầu "hủy giúp tôi booking X", When xử lý, Then bot KHÔNG tự hủy mà hướng dẫn + dẫn tới luồng hủy chuẩn (bất biến #8).
- `AC-AI-02-5` — Given Gemini lỗi/hết quota, When hỏi, Then bot báo tạm bận, không chặn các chức năng nghiệp vụ khác.
- `AC-AI-02-6` — Given câu trả lời có dùng nguồn, When hiển thị, Then nêu được nguồn/căn cứ (chính sách nào, dữ liệu nào của user) — minh bạch, không bịa.

## 5. Ngoài phạm vi (toàn module)
- AI tự thực hiện hành động nhạy cảm (phá bất biến #8).
- Smart Court Recommendation, AI moderation, AI Revenue Analysis, Admin Ops Assistant (đã loại).
- Huấn luyện/fine-tune mô hình riêng; chỉ gọi Gemini API.
- Gửi dữ liệu chéo giữa các user vào prompt.

## 6. Quyết định chờ PO chốt
1. Model Gemini cụ thể (đề xuất flash cho rẻ/nhanh).
2. Giới hạn tần suất gọi AI mỗi user (chống cháy quota free-tier).
3. Cách lưu/index nguồn RAG (đề xuất: embed tài liệu chính sách; dữ liệu user truy vấn trực tiếp
   qua API service tương ứng theo `userId`, không nhân bản chéo schema).
