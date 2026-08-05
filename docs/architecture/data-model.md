---
type: architecture
status: draft
updated: 2026-08-06
builds_on: docs/architecture/system-architecture.md
purpose: Data model đầy đủ 5 service (ERD per-service) + state machine các thực thể có vòng đời.
applied: "G0 (2026-08-06) đã áp 12 thay đổi tại decision-log.md §5 vào 3 ERD GĐ1 (account,
  venue-booking, finance). matchmaking/community giữ nguyên bản nháp GĐ2, chưa áp/migrate."
---

# Data model — đầy đủ 5 service

Mỗi service một schema Postgres riêng. `userId` là **tham chiếu** sang account-service, không FK chéo schema.
Mỗi service còn có 2 bảng hạ tầng: `Outbox` (publish event) và `ProcessedEvent` (idempotency) — xem mục 7.

## 1. account-service

```mermaid
erDiagram
    USER ||--o| PLAYER_PROFILE : has
    USER ||--o{ VERIFICATION : requests
    USER ||--o{ PASSWORD_RESET : requests
    USER ||--o{ ACCOUNT_AUDIT : target_of

    USER {
        uuid id PK
        string email UK
        string phone
        string passwordHash
        enum[] roles "player|provider|admin — TẬP HỢP, D3 (không còn enum đơn giá trị)"
        bool verified
        enum status "active|locked"
        timestamptz createdAt
    }
    PLAYER_PROFILE {
        uuid userId PK_FK
        string displayName
        string avatarUrl
        jsonb preferences
        enum visibility "public|private"
    }
    VERIFICATION {
        uuid id PK
        uuid userId FK
        enum channel "email|phone"
        string code
        timestamptz expiresAt
        timestamptz consumedAt
    }
    PASSWORD_RESET {
        uuid id PK
        uuid userId FK
        string token
        timestamptz expiresAt
        timestamptz consumedAt
    }
    ACCOUNT_AUDIT {
        uuid id PK
        uuid actorUserId
        string action
        uuid targetUserId
        string reason
        timestamptz ts
    }
```
Token blacklist (đăng xuất/thu hồi) để ở Redis, không ở DB.

## 2. venue-booking-service

```mermaid
erDiagram
    PROVIDER ||--o{ VENUE : owns
    VENUE ||--o{ COURT : has
    COURT ||--o{ OPERATING_HOURS : open_on
    COURT ||--o{ CLOSURE : closed_on
    COURT ||--o{ PRICING_RULE : priced_by
    COURT ||--o{ BOOKING_RULE : constrained_by
    COURT ||--o{ HOLD : temp_locks
    COURT ||--o{ BOOKING : booked_as

    PROVIDER {
        uuid id PK
        uuid userId
        string orgName
        enum status "pending|approved|suspended|rejected"
        jsonb contact
    }
    VENUE {
        uuid id PK
        uuid providerId FK
        string name
        float lat
        float lng
        string address
        jsonb amenities
        jsonb images
    }
    COURT {
        uuid id PK
        uuid venueId FK
        string name
        bool active
    }
    PRICING_RULE {
        uuid id PK
        uuid courtId FK
        int weekday
        time startTime
        time endTime
        bigint price
        int version
        timestamptz effectiveFrom
    }
    HOLD {
        uuid id PK
        uuid courtId FK
        tstzrange timeRange
        uuid userId
        timestamptz expiresAt
    }
    BOOKING {
        uuid id PK
        uuid courtId FK
        tstzrange timeRange
        uuid userId "nullable — BR-VEN-08a, booking nội bộ không gắn tài khoản"
        string guestName "nullable, chỉ dùng khi source=internal — BR-VEN-08a"
        string guestContact "nullable, chỉ dùng khi source=internal — BR-VEN-08a"
        enum source "marketplace|internal"
        enum status "held|confirmed|completed|cancelled"
        enum cancellationReason "nullable — self|provider_fault|platform_admin, D10 (phân biệt FIN-07 tự hủy vs FIN-08 hoàn 100%)"
        jsonb policySnapshot
        bigint priceSnapshot
        timestamptz createdAt
    }
```
**Chống đặt trùng:** `EXCLUDE` constraint trên `(courtId, timeRange)` cho booking `confirmed` + advisory lock khi tạo hold.

> **`BOOKING_REVIEW` đã bị loại khỏi ERD (D7)** — không có use case đánh giá booking sân ở GĐ1;
> nếu mở lại ở giai đoạn sau, dựng thực thể mới lúc đó thay vì phục hồi bản này.
> **`CANCELLATION_POLICY` đã bị loại khỏi ERD (D9)** — chính sách hủy là hằng số nền tảng
> (`BR-BOK-05`), không phải cấu hình theo `PROVIDER`; chỉ còn `policySnapshot` trên `BOOKING`.
> **`OPERATING_HOURS`, `CLOSURE`, `BOOKING_RULE`** được nhắc tới trong quan hệ ở trên nhưng
> **chưa có định nghĩa cột nào ở đây** — đây là khoảng trống có từ trước, không thuộc 12 thay
> đổi G0 phải áp. Trường cụ thể do **G2** (chủ sở hữu VEN-05/VEN-06/VEN-07) định nghĩa khi hiện
> thực các use case đó, tránh G0 tự suy đoán trước một quyết định thiết kế nghiệp vụ.

## 3. finance-service

```mermaid
erDiagram
    WALLET ||--o{ LEDGER_ENTRY : records
    WALLET ||--o{ PAYMENT_INTENT : initiates
    WITHDRAWAL_REQUEST ||--o| SEPAY_EVENT : reconciled_by
    DISPUTE }o--o| LEDGER_ENTRY : adjusts

    WALLET {
        uuid id PK
        uuid userId "nullable — ví platform không có chủ (D16); bỏ UK đơn lẻ, D3"
        enum walletType "personal|business|platform — D3, D16"
        bigint available
        bigint pending "chỉ có ý nghĩa cho business — ADR 0003"
        bigint reserved "chỉ có ý nghĩa cho business — BR-FIN-16, ba phân vùng"
        string currency
    }
    LEDGER_ENTRY {
        uuid id PK
        uuid walletId FK
        bigint amount
        enum type "topup|payment|refund|payout|commission|release"
        string refType
        uuid refId
        bigint before
        bigint after
        timestamptz ts
    }
    PAYMENT_INTENT {
        uuid id PK
        uuid userId
        bigint amount
        enum method "balance|sepay"
        enum refType "booking|matchFee"
        uuid refId
        enum status "pending|completed|failed"
        timestamptz createdAt
    }
    SEPAY_EVENT {
        uuid id PK
        enum direction "in|out"
        bigint amount
        string rawRef
        string matchedType
        uuid matchedId
        enum status "unmatched|matched_auto|matched_manual|out_of_scope — BR-FIN-17"
        timestamptz receivedAt
    }
    WITHDRAWAL_REQUEST {
        uuid id PK
        uuid sellerUserId
        bigint amount
        enum status "pending|paid|rejected|partially_paid — BR-FIN-19"
        bigint paidAmount "nullable, mặc định 0 — BR-FIN-19"
        uuid sePayEventId
        timestamptz createdAt
        timestamptz processedAt
    }
    DISPUTE {
        uuid id PK
        string refType
        uuid refId
        uuid bookingId "liên kết tới booking — D11 (venue-booking, không FK chéo schema)"
        uuid raiserUserId
        jsonb evidence
        enum status "open|resolved"
        string resolution
        uuid decidedByUserId
        timestamptz deadlineAt "mốc hạn 24 giờ từ lúc ca kết thúc — D11"
    }
```

## 4. matchmaking-service

```mermaid
erDiagram
    MATCH ||--o{ WAITLIST_ENTRY : receives
    MATCH ||--o{ PARTICIPANT : has
    MATCH ||--o{ MATCH_REVIEW : reviewed_by
    PLAYER_RATING ||--o| SKILL_DECLARATION : seeded_by

    MATCH {
        uuid id PK
        uuid hostUserId
        uuid bookingRef
        jsonb externalVenue
        enum type "giaoLuu"
        int totalSlots
        int filledSlots
        float skillBandMin
        float skillBandMax
        bigint fee
        enum status "open|full|closed|invite|cancelled|completed"
        timestamptz startTime
    }
    WAITLIST_ENTRY {
        uuid id PK
        uuid matchId FK
        uuid userId
        float compatScore
        enum status "pending|approved|held|confirmed|withdrawn|rejected|expired"
        timestamptz holdExpiresAt
        timestamptz createdAt
    }
    PARTICIPANT {
        uuid id PK
        uuid matchId FK
        uuid userId
        timestamptz joinedAt
    }
    PLAYER_RATING {
        uuid userId PK
        float ratingValue
        float uncertainty
        int gamesCount
        timestamptz updatedAt
    }
    SKILL_DECLARATION {
        uuid userId PK
        enum declaredBand "moi|Y|TB|TB+|BC"
        timestamptz declaredAt
    }
    MATCH_REVIEW {
        uuid id PK
        uuid matchId FK
        uuid raterUserId
        uuid rateeUserId
        int score
        string comment
        timestamptz publishedAt
    }
    QUICK_MATCH_SESSION {
        uuid id PK
        uuid userId
        jsonb filters
        bool active
        timestamptz createdAt
    }
```
**Player Passport** = view tổng hợp trên `PLAYER_RATING` + lịch sử `PARTICIPANT` + `MATCH_REVIEW` (không phải bảng riêng).

## 5. community-service

```mermaid
erDiagram
    POST ||--o{ COMMENT : has
    POST ||--o{ REPORT : reported_by
    REPORT ||--o| MODERATION_CASE : resolved_by
    SUPPORT_TICKET ||--o{ SUPPORT_MESSAGE : contains

    POST {
        uuid id PK
        uuid authorUserId
        string body
        jsonb images
        enum status "visible|hidden|removed"
        timestamptz createdAt
    }
    COMMENT {
        uuid id PK
        uuid postId FK
        uuid authorUserId
        string body
        enum status "visible|hidden|removed"
        timestamptz createdAt
    }
    REPORT {
        uuid id PK
        enum contentType "post|comment|user"
        uuid contentId
        uuid reporterUserId
        string reason
        enum status "open|actioned|dismissed"
        timestamptz createdAt
    }
    MODERATION_CASE {
        uuid id PK
        uuid reportId FK
        uuid moderatorUserId
        enum decision "hide|remove|dismiss"
        string reason
        timestamptz decidedAt
    }
    SUPPORT_TICKET {
        uuid id PK
        uuid userId
        string subject
        enum status "open|answered|closed"
        timestamptz createdAt
    }
    SUPPORT_MESSAGE {
        uuid id PK
        uuid ticketId FK
        uuid senderUserId
        string body
        timestamptz createdAt
    }
```

## 6. State machine — thực thể có vòng đời

### Booking
```mermaid
stateDiagram-v2
    [*] --> held: tạo booking + giữ slot
    held --> confirmed: PaymentCompleted (còn hạn hold)
    held --> cancelled: hết hạn hold / user hủy
    confirmed --> completed: ca kết thúc
    confirmed --> cancelled: hủy (hoàn tiền theo policy)
    completed --> [*]
    cancelled --> [*]
```

### WaitlistEntry (ghép kèo)
```mermaid
stateDiagram-v2
    [*] --> pending: nộp / tìm nhanh
    pending --> approved: host duyệt
    pending --> rejected: host từ chối
    approved --> held: giữ chỗ 10'
    held --> confirmed: trả phí (PaymentCompleted)
    held --> expired: hết 10' không trả
    expired --> pending: trả chỗ về hàng chờ
    approved --> withdrawn: thắng kèo khác → tự rút
    held --> withdrawn: thắng kèo khác → tự rút
    confirmed --> [*]
    rejected --> [*]
    withdrawn --> [*]
```

### Match
```mermaid
stateDiagram-v2
    [*] --> open
    open --> full: đủ người
    open --> cancelled: host hủy / thiếu người
    full --> closed: chốt danh sách
    closed --> completed: kèo diễn ra xong
    completed --> [*]
    cancelled --> [*]
```

### WithdrawalRequest
```mermaid
stateDiagram-v2
    [*] --> pending: bên bán yêu cầu
    pending --> paid: webhook SePay khớp tiền ra
    pending --> rejected: admin từ chối
    paid --> [*]
    rejected --> [*]
```

## 7. Bảng hạ tầng chung (mỗi service)

| Bảng | Cột | Vai trò |
|---|---|---|
| `Outbox` | id, aggregateType, aggregateId, eventType, payload, createdAt, publishedAt | Ghi cùng transaction domain → relay publish RabbitMQ |
| `ProcessedEvent` | eventId PK, processedAt | Idempotency cho consumer (bỏ qua event trùng) |
