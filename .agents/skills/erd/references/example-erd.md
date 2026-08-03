---
type: srs-erd
feature: payment
updated: 2026-07-13
---

# payment — Entity Relationship Diagram

> Scope: feature payment

## Diagram

```mermaid
erDiagram
    USER ||--o{ ORDER : "đặt"
    USER ||--o{ PAYMENT_METHOD : "sở hữu"
    ORDER ||--|{ TRANSACTION : "phát sinh"
    TRANSACTION }o--o| PAYMENT_METHOD : "dùng"
    TRANSACTION ||--o{ REFUND : "có thể hoàn"

    USER {
        string id PK
        string email "địa chỉ liên hệ, duy nhất"
        string phone "số điện thoại, có thể rỗng"
        date created_at "ngày tạo"
    }

    ORDER {
        string id PK
        string user_id FK "rỗng nếu khách vãng lai"
        decimal amount "số tiền (VND)"
        string status "chờ | đã xác nhận | đã thanh toán | đã huỷ"
        date created_at "ngày tạo"
    }

    TRANSACTION {
        string id PK
        string order_id FK "thuộc đơn nào"
        string payment_method_id FK "rỗng nếu thanh toán qua redirect"
        string gateway "Momo | VNPay | Stripe"
        string status "chờ | thành công | thất bại | đã hoàn"
        decimal amount "số tiền giao dịch (VND)"
        date created_at "ngày tạo"
    }

    PAYMENT_METHOD {
        string id PK
        string user_id FK "của khách nào"
        string type "thẻ | Momo | VNPay"
        string display_name "tên hiển thị cho khách chọn"
        boolean is_default "phương thức mặc định?"
    }

    REFUND {
        string id PK
        string transaction_id FK "hoàn cho giao dịch nào"
        decimal amount "số tiền hoàn (VND)"
        string reason "lý do hoàn"
        string approved_by FK "admin duyệt hoàn"
        string status "chờ | thành công | thất bại"
        date created_at "ngày tạo"
    }
```

## Entity Reference

| Entity | Purpose | Key attributes |
|--------|---------|----------------|
| USER | Tài khoản khách hàng (khách vãng lai không có bản ghi) | email (duy nhất), phone, ngày tạo |
| ORDER | Đơn hàng phát sinh từ checkout | số tiền, trạng thái đơn |
| TRANSACTION | Mỗi lần thử thanh toán cho 1 đơn | cổng thanh toán, trạng thái, số tiền |
| PAYMENT_METHOD | Phương thức đã lưu để khách chọn lại lần sau | loại, tên hiển thị, mặc định |
| REFUND | Mỗi lần admin duyệt hoàn tiền | số tiền hoàn, lý do, admin duyệt |

## Notes & Assumptions

- **Khách vãng lai không có bản ghi USER** — `ORDER.user_id` để rỗng, chỉ khách đăng nhập mới gắn được vào tài khoản.
- **Trạng thái ORDER đi 1 chiều:** chờ sang đã xác nhận sang đã thanh toán, hoặc rẽ sang đã huỷ. Không quay ngược. (Chi tiết chuyển trạng thái xem `srs/payment-states.md`.)
- **TRANSACTION.payment_method_id để rỗng** khi khách thanh toán qua redirect (Momo/VNPay chuyển sang trang cổng) — chỉ luồng thẻ Stripe mới ghi phương thức đã lưu.
- **REFUND.approved_by** trỏ tới tài khoản admin duyệt — quy tắc nghiệp vụ chỉ admin mới được tạo lệnh hoàn (BR-payment-004).
- **Admin dùng chung bảng USER** với khách hàng, phân biệt bằng vai trò — không tách entity ADMIN riêng (Mermaid không có cú pháp kế thừa; xem gotcha inheritance).
- **Hoàn tiền v1 chỉ hoàn toàn phần** — hoàn một phần để Phase 1.1.
