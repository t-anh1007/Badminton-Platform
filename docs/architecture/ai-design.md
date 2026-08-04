---
type: architecture
status: draft
updated: 2026-08-04
builds_on: docs/discovery/2026-08-04-tinh-nang-moi.md
purpose: Thiết kế thư viện AI (packages/ai) — F-01..F-07: input, output, cách làm, cold-start.
---

# Thiết kế thư viện AI

AI là **thư viện TypeScript dùng chung** (`packages/ai`), không service riêng. Gồm:
- **Hàm thuần** (rating, độ hợp, gom nhóm, phân tích) — chạy trong service gọi nó.
- **Adapter LLM** (LangChain.js) cho chatbot / giải thích / soạn tóm tắt — có **fallback theo luật** khi LLM không khả dụng.

**Ràng buộc bất biến (baseline):** AI chỉ **hỗ trợ và giải thích**, không tự đặt sân/tham gia/thanh toán/hoàn tiền/đổi giá/khóa tài khoản. Mọi quyết định nhạy cảm do người thực hiện.

Thang trình độ (F-01): 5 bậc hiển thị `Mới chơi → Y → TB → TB+ → BC` ánh xạ lên trục số nội bộ.

---

## F-01 — Điểm trình độ có độ bất định

| | |
|---|---|
| **Dùng ở** | matchmaking-service |
| **Input** | Bậc tự khai ban đầu (`SkillDeclaration`); kết quả trận + đánh giá (`MatchReview`, đối thủ) |
| **Output** | `ratingValue` (số) + `uncertainty` (độ lệch) → suy ra bậc hiển thị + cờ "đã xác minh / tự khai" |
| **Cách làm** | Glicko-lite: khởi tạo `ratingValue` = giữa dải bậc tự khai, `uncertainty` **rộng**; sau mỗi trận có kết quả, cập nhật `ratingValue` theo đối thủ + kết quả, giảm `uncertainty`. Bậc hiển thị = ánh xạ khoảng số → nhãn |
| **Cold-start** | ✅ khởi đầu `uncertainty` rộng, không cần lịch sử |
| **Nền cho** | F-02, F-03, F-04 |

## F-02 — Điểm độ hợp + giải thích

| | |
|---|---|
| **Dùng ở** | matchmaking-service |
| **Input** | rating người tìm (F-01) + sở thích; tiêu chí kèo (khoảng trình độ, giờ, khoảng cách, giá, phong cách) |
| **Output** | điểm 0–100 + **giải thích ngôn ngữ tự nhiên** |
| **Cách làm** | Điểm = tổng có trọng số các đặc trưng: khớp trình độ (khoảng cách rating), khoảng cách địa lý, khớp giờ, khớp giá. Đóng góp từng đặc trưng → LLM soạn câu giải thích **trung thực với đặc trưng** (fallback: template theo đặc trưng cao/thấp nhất) |
| **Cold-start** | ✅ dùng dữ liệu hiện tại, không cần lịch sử |

## F-03 — Ghép kèo live *(engine, không phải model)*

| | |
|---|---|
| **Dùng ở** | matchmaking-service (WebSocket) |
| **Input** | Lối A: filter "Tìm nhanh" của người tìm. Lối B: sự kiện có người rút. Hồ kèo mở / người rảnh |
| **Output** | Hàng chờ của host **xếp theo điểm độ hợp (F-02)** |
| **Cách làm** | Lọc **hai chiều** (filter người tìm ∩ tiêu chí host) → xếp hạng theo F-02. Host duyệt → giữ chỗ 10' → trả phí → xác nhận. Nộp nhiều kèo, **ai duyệt+trả trước thắng** → nguyên tử: khóa chỗ thắng, tự rút chỗ còn lại, nhả chỗ đã duyệt về hàng chờ. Thuần thuật toán — **không cần LLM** |
| **Cold-start** | ✅ dùng người chơi/kèo hiện có |

## F-04 — Gom nhóm lẻ cân bằng

| | |
|---|---|
| **Dùng ở** | matchmaking-service |
| **Input** | Hồ người chơi lẻ đang tìm + rating (F-01) |
| **Output** | Các nhóm cân bằng trình độ |
| **Cách làm** | Bài toán chia phân vùng cân bằng: tối thiểu phương sai rating trong nhóm. Greedy (xếp lần lượt vào nhóm có trung bình gần nhất) hoặc tối ưu đơn giản. Trình bày được thuật toán khi bảo vệ |
| **Cold-start** | ✅ dùng hồ hiện tại (tốt hơn khi có rating) |

## F-05 — Bản đồ nhiệt nhu cầu & giờ vàng *(cần seed)*

| | |
|---|---|
| **Dùng ở** | venue-booking-service |
| **Input** | Lịch sử booking (từ **bộ seed** — hoãn tới sau báo cáo tiến độ) |
| **Output** | Người chơi: "giờ vàng nên đi". Chủ sân: slot đang ế |
| **Cách làm** | Tổng hợp booking theo `court × weekday × hour`; percentile để phân "kín/ế". Có thể thêm dự báo đơn giản |
| **Cold-start** | ❌ **cần dữ liệu** — cắt được đầu tiên nếu deadline căng |

## F-07 — Trợ lý đánh giá công bằng

| | |
|---|---|
| **Dùng ở** | matchmaking-service + venue-booking-service (áp cho review 2 phía) |
| **Input** | Bối cảnh trận/booking, lịch sử hai bên, mức đánh giá đề xuất |
| **Output** | Tóm tắt trận (draft) + gợi ý mức đánh giá + **cờ đánh giá bất thường** |
| **Cách làm** | LLM soạn tóm tắt; "bất thường" = lệch thống kê (đánh giá thấp bất thường so với chuẩn của người đánh / mẫu trả đũa). Chỉ cảnh báo, **không tự sửa/ẩn** |
| **Cold-start** | ✅ |

---

## Đóng gói `packages/ai`

```
packages/ai/
├── rating/        # F-01: init, update, bandMapping
├── compat/        # F-02: featureScore + explain
├── matching/      # F-03: filter + rank (engine gọi từ matchmaking)
├── grouping/      # F-04: balancedPartition
├── analytics/     # F-05: demandAggregate
├── review-assist/ # F-07: summarize + anomalyFlag
└── llm/           # adapter LangChain.js + fallback theo luật
```
- Hàm thuần (rating/compat/matching/grouping/analytics) test bằng Vitest, không cần LLM.
- `llm/` có **fallback theo luật** để hệ thống vẫn chạy khi thiếu LLM/thiếu dữ liệu.
