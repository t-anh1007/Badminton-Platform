---
type: spec
feature: F-05
phase: 3
status: draft-for-po-review
created: 2026-08-08
condition: Chỉ triển khai nếu bộ seed mô phỏng sẵn sàng (Q2 trong decision-log)
source: discovery/2026-08-04-tinh-nang-moi.md §6, architecture/ai-design.md §F-05
---

# F-05 — Bản đồ nhiệt nhu cầu & giờ vàng

> **Điều kiện tiên quyết:** F-05 chỉ vào phạm vi GĐ3 nếu bộ seed mô phỏng đã được chuẩn bị
> (phasing.md §4.4). Nếu deadline căng, đây là hạng mục **cắt đầu tiên** — việc cắt không phá
> câu chuyện lõi của sản phẩm.

## 1. Tổng quan

| | |
|---|---|
| **Actor** | Người chơi, Nhà cung cấp sân |
| **Module** | venue-booking-service (đọc dữ liệu), packages/ai/analytics (tính toán) |
| **Input** | Lịch sử booking (từ bộ seed mô phỏng hoặc dữ liệu tích lũy thật) |
| **Output cầu** | Người chơi: bản đồ nhiệt nhu cầu + gợi ý "giờ vàng" (rẻ hơn, dễ đặt) |
| **Output cung** | Nhà cung cấp sân: phân tích slot đang ế, gợi ý điều chỉnh |
| **Phụ thuộc** | BOK-04 (lịch trống), VEN-06 (biểu giá), dữ liệu booking GĐ1 |
| **Ràng buộc AI** | Bất biến #8 — F-05 chỉ hiển thị phân tích, KHÔNG tự đặt sân / đổi giá |

## 2. Workflow

### 2.1. Phía người chơi

1. Người chơi vào trang chi tiết cơ sở sân (BOK-03) hoặc xem lịch trống (BOK-04).
2. Hệ thống hiển thị **bản đồ nhiệt** (heatmap) nhu cầu theo `weekday × hour` cho cơ sở đó.
3. Mỗi ô hiển thị mức nhu cầu: **kín** (hot), **trung bình** (warm), **dễ đặt** (cold).
4. Kèm gợi ý ngắn: *"Sân này thường kín 19–21h. Thử 17h — rẻ hơn và dễ đặt."*
5. Nếu không đủ dữ liệu (< ngưỡng), hiển thị thông báo "Chưa đủ dữ liệu phân tích".

### 2.2. Phía nhà cung cấp sân

1. Nhà cung cấp vào dashboard quản lý cơ sở.
2. Hệ thống hiển thị **báo cáo slot ế**: danh sách các khung giờ có tỷ lệ lấp đầy thấp.
3. Gợi ý: *"Slot 14–16h thứ 3, 4 chỉ đạt 20% — cân nhắc giảm giá giờ này."*

## 3. Business Rules

| Mã | Quy tắc |
|---|---|
| BR-F05-01 | Dữ liệu tổng hợp theo `venue × court × weekday × hour`. Percentile để phân mức: ≥ P75 = kín, P25–P75 = trung bình, < P25 = dễ đặt |
| BR-F05-02 | Ngưỡng tối thiểu: cần ≥ `MIN_BOOKINGS_FOR_HEATMAP` booking (mặc định 50) trong 30 ngày gần nhất cho một cơ sở để hiển thị heatmap. Dưới ngưỡng → "Chưa đủ dữ liệu" |
| BR-F05-03 | Kết quả được **cache** (TTL mặc định 1 giờ). Không tính realtime mỗi request |
| BR-F05-04 | F-05 là hàm thuần thống kê, KHÔNG gọi LLM. Nằm trong `packages/ai/analytics/demandAggregate` |
| BR-F05-05 | Gợi ý text cho người chơi và nhà cung cấp dùng template cố định, không sinh bởi LLM |
| BR-F05-06 | F-05 chỉ **đọc** dữ liệu booking, KHÔNG ghi/sửa/xóa bất kỳ thứ gì (bất biến #8) |

## 4. Acceptance Criteria

| AC | Mô tả |
|---|---|
| AC-F05-1 | Trang chi tiết cơ sở sân hiển thị heatmap `weekday × hour` khi cơ sở có ≥ `MIN_BOOKINGS_FOR_HEATMAP` booking trong 30 ngày |
| AC-F05-2 | Heatmap phân biệt ít nhất 3 mức nhu cầu (kín / trung bình / dễ đặt) bằng màu sắc khác nhau |
| AC-F05-3 | Người chơi thấy gợi ý "giờ vàng" (ít nhất 1 slot dễ đặt + rẻ hơn giờ cao điểm) khi dữ liệu đủ |
| AC-F05-4 | Khi dữ liệu < ngưỡng, hiển thị "Chưa đủ dữ liệu phân tích" thay vì heatmap sai lệch |
| AC-F05-5 | Nhà cung cấp sân thấy danh sách slot có tỷ lệ lấp đầy < P25 kèm gợi ý |
| AC-F05-6 | Hàm `demandAggregate` nằm trong `packages/ai/analytics/`, test bằng Vitest với dữ liệu fixture, không gọi LLM |
| AC-F05-7 | Kết quả được cache; hai request liên tiếp trong TTL không truy vấn lại DB (kiểm bằng spy) |
| AC-F05-8 | F-05 không ghi/sửa/xóa dữ liệu — chỉ đọc booking history (kiểm bằng test âm: gọi endpoint, đếm row count trước/sau khớp nhau) |

## 5. Seed Data Requirements

| Thông số | Giá trị đề xuất | 【PO-REVIEW】 |
|---|---|---|
| Số user giả | ≥ 100 người chơi + ≥ 5 nhà cung cấp | Chốt trước P3-M2 |
| Số booking giả | ≥ 2000 booking phân bố 3 tháng | Chốt trước P3-M2 |
| Phân bố thời gian | Mô phỏng pattern thực: giờ cao điểm 18–21h, cuối tuần cao hơn ngày thường | — |
| Số kèo giả | ≥ 200 (cho F-01 rating có đủ dữ liệu) | — |

Nếu seed chưa sẵn sàng khi vào P3-M2, milestone bị **skip** và F-05 bị cắt — ghi vào
`phase-3-progress.md` là `skipped — thiếu seed`.

## 6. Ngoài phạm vi

- Dự báo nhu cầu (forecasting) — chỉ tổng hợp quá khứ.
- Đề xuất giá động cho nhà cung cấp — đã bị loại ở SCOPE_BASELINE §3.
- Bản đồ nhiệt trên bản đồ địa lý (chỉ trên grid weekday × hour).
- Tự động điều chỉnh giá dựa trên phân tích — phá bất biến #8.

## 7. Giả định chờ PO

| # | Giả định | Rủi ro |
|---|---|---|
| A-F05-01 | Ngưỡng `MIN_BOOKINGS_FOR_HEATMAP = 50` là đủ để heatmap có ý nghĩa thống kê | Thấp |
| A-F05-02 | Cửa sổ 30 ngày là phù hợp cho dữ liệu booking (không quá ngắn mất pattern, không quá dài có noise) | Thấp |
| A-F05-03 | Cache TTL = 1 giờ là chấp nhận được (heatmap không cần realtime) | Thấp |
