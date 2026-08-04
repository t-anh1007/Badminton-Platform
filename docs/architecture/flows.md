---
type: architecture
status: draft
updated: 2026-08-04
builds_on: docs/architecture/system-architecture.md
purpose: Các luồng chính (sequence) của hệ thống.
---

# Luồng chính

3 luồng đã vẽ ở [system-architecture.md](system-architecture.md) mục 8: **đặt sân+thanh toán**,
**ghép kèo live (F-03)**, **rút tiền+đối soát SePay**. File này bổ sung các luồng còn lại.

## 1. Đăng ký + xác minh

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant ACC as account-service
    participant FIN as finance-service
    U->>ACC: Đăng ký (email/phone, mật khẩu)
    ACC->>ACC: Tạo User (verified=false)
    ACC-->>U: Gửi mã xác minh
    U->>ACC: Nhập mã
    ACC->>ACC: verified=true
    ACC--)FIN: UserRegistered
    FIN->>FIN: Tạo Wallet rỗng
    ACC-->>U: Đăng nhập → JWT
```

## 2. Nạp số dư qua SePay

```mermaid
sequenceDiagram
    participant U as Người chơi
    participant FIN as finance-service
    participant SP as SePay
    U->>FIN: Yêu cầu nạp (mã nội dung riêng)
    U->>SP: Chuyển khoản (nội dung có mã)
    SP--)FIN: Webhook "tiền vào" + nội dung
    FIN->>FIN: Khớp mã → ghi có ví (LedgerEntry topup)
    FIN-->>U: Số dư cập nhật
```

## 3. Vòng đời kèo (tạo → tham gia → chơi → đánh giá)

```mermaid
sequenceDiagram
    participant H as Host
    participant P as Người chơi
    participant MM as matchmaking-service
    participant FIN as finance-service
    H->>MM: Tạo & công bố kèo (gắn booking / sân ngoài)
    P->>MM: Xin tham gia
    MM->>MM: Chấm độ hợp (F-02) → hàng chờ
    H->>MM: Duyệt → giữ chỗ 10'
    P->>FIN: Trả phí (nếu có)
    FIN--)MM: PaymentCompleted{matchFee}
    MM->>MM: Participant + filledSlots++
    Note over MM: Kèo diễn ra
    MM--)MM: BookingCompleted → mở đánh giá
    P->>MM: Đánh giá (F-07 hỗ trợ)
    MM->>MM: Cập nhật rating (F-01) sau khi công bố 2 phía
```

## 4. Hủy + hoàn tiền theo policy

```mermaid
sequenceDiagram
    participant U as Người chơi
    participant VB as venue-booking-service
    participant FIN as finance-service
    U->>VB: Hủy booking
    VB->>VB: Áp policySnapshot (mẫu hủy đã lưu)
    VB--)FIN: BookingCancelled{refundRule}
    alt Lỗi sân/hệ thống hoặc trong hạn miễn phí
        FIN->>FIN: Hoàn 100% vào số dư
    else Ngoài hạn
        FIN->>FIN: Hoàn một phần / không hoàn theo policy
    end
    FIN-->>U: LedgerEntry refund (vào ví)
```

## 5. Thanh toán đến muộn (sau khi hết hạn hold)

```mermaid
sequenceDiagram
    participant SP as SePay
    participant FIN as finance-service
    participant VB as venue-booking-service
    SP--)FIN: Webhook "tiền vào" (booking đã hết hạn)
    FIN->>VB: Booking còn hold không?
    VB-->>FIN: Đã hết hạn / đã nhả
    FIN->>FIN: Ghi có ví (KHÔNG phục hồi booking)
    Note over FIN: Đúng business rule #3 baseline
```

## 6. Tranh chấp giao dịch

```mermaid
sequenceDiagram
    participant U as Người chơi
    participant FIN as finance-service
    participant A as Admin
    U->>FIN: Gửi tranh chấp + bằng chứng
    FIN->>FIN: Dispute(open) → khóa tiền liên quan
    A->>FIN: Xem bằng chứng (AI chỉ hỗ trợ tóm tắt)
    A->>FIN: Quyết định
    FIN->>FIN: Dispute(resolved) + bút toán đảo nếu cần
    FIN-->>U: Kết quả
```

## 7. Báo cáo + kiểm duyệt nội dung

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant COM as community-service
    participant A as Admin
    U->>COM: Báo cáo bài/bình luận
    COM->>COM: Report(open) → ModerationCase
    A->>COM: Xem hàng đợi kiểm duyệt
    A->>COM: Quyết định (hide/remove/dismiss)
    COM->>COM: Cập nhật trạng thái nội dung
    Note over COM: Kiểm duyệt do người (admin); không AI tự ẩn
```

## Ghi chú
- Mọi luồng chạm tiền đều qua **finance-service** và ghi **LedgerEntry append-only**.
- Event bất đồng bộ dùng **outbox + RabbitMQ**; consumer idempotent (mục 6 system-architecture).
- AI xuất hiện ở luồng chỉ với vai trò **hỗ trợ** (F-02 độ hợp, F-07 tóm tắt) — không tự quyết.
