---
type: architecture
status: draft
updated: 2026-08-04
builds_on: docs/architecture/system-architecture.md
purpose: Data model đầy đủ 5 service (ERD per-service) + state machine các thực thể có vòng đời.
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
        enum role "player|provider|admin"
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
    PROVIDER ||--o{ CANCELLATION_POLICY : defines
    BOOKING ||--o{ BOOKING_REVIEW : reviewed_by

    PROVIDER {
        uuid id PK
        uuid userId
        string orgName
        enum status "pending|approved|suspended"
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
        uuid userId
        enum source "marketplace|internal"
        enum status "held|confirmed|completed|cancelled"
        jsonb policySnapshot
        bigint priceSnapshot
        timestamptz createdAt
    }
    BOOKING_REVIEW {
        uuid id PK
        uuid bookingId FK
        uuid raterUserId
        enum ratee "player|venue"
        int score
        string comment
        timestamptz publishedAt
    }
```
**Chống đặt trùng:** `EXCLUDE` constraint trên `(courtId, timeRange)` cho booking `confirmed` + advisory lock khi tạo hold.

## 3. finance-service

```mermaid
erDiagram
    WALLET ||--o{ LEDGER_ENTRY : records
    WALLET ||--o{ PAYMENT_INTENT : initiates
    WITHDRAWAL_REQUEST ||--o| SEPAY_EVENT : reconciled_by
    DISPUTE }o--o| LEDGER_ENTRY : adjusts

    WALLET {
        uuid id PK
        uuid userId UK
        bigint available
        bigint pending
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
        timestamptz receivedAt
    }
    WITHDRAWAL_REQUEST {
        uuid id PK
        uuid sellerUserId
        bigint amount
        enum status "pending|paid|rejected"
        uuid sePayEventId
        timestamptz createdAt
        timestamptz processedAt
    }
    DISPUTE {
        uuid id PK
        string refType
        uuid refId
        uuid raiserUserId
        jsonb evidence
        enum status "open|resolved"
        string resolution
        uuid decidedByUserId
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
