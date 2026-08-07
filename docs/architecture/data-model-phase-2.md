---
type: data-model-addendum
phase: 2
status: draft-for-po-review
author: Claude Code
updated: 2026-08-07
extends: docs/architecture/data-model.md
---

# Data Model (phụ lục GĐ2) — matchmaking · community · AI library

Schema-per-service (D17): mỗi service sở hữu schema riêng, **không FK/query xuyên schema**. Tham
chiếu sang service khác (`userId`, `bookingId`...) là **giá trị tham chiếu, không FK**. AI là
`packages/ai` theo ADR 0002, không có service/schema riêng; mọi persistence tương lai phải được PO
chốt trong schema của service sở hữu.

## 1. Schema `matchmaking` (service `matchmaking-service`)

### MATCH (kèo)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| organizerUserId | uuid | tham chiếu account (không FK) |
| bookingId | uuid | tham chiếu venue-booking (không FK); slot sân của kèo |
| capacity | int | ≥2 (BR-MMP-03) |
| feePerSlot | bigint | VND; 0 = miễn phí (BR-MMP-08). Mặc định = giá booking / capacity |
| skillMin, skillMax | int? | khoảng rating mong muốn (tùy chọn) |
| status | enum | `open`/`filled`/`confirmed`/`completed`/`cancelled` |
| cutoffAt | timestamptz | hạn chốt (BR-MMP-07) |
| createdAt | timestamptz | |

### JOIN (lượt tham gia)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| matchId | uuid FK→MATCH | trong CÙNG schema nên FK hợp lệ |
| participantUserId | uuid | tham chiếu account (không FK) |
| status | enum | `pending`/`approved`/`rejected`/`confirmed`/`withdrawn` |
| feePaidAt | timestamptz? | mốc trả phí (FIN-05) |
| approvedAt | timestamptz? | mở cửa sổ trả phí (holdMinutes) |
| createdAt | timestamptz | |
| — | | **UNIQUE (matchId, participantUserId)** WHERE status ∉ (rejected, withdrawn) — BR-MMP-04 |
| — | | Ràng buộc chống chồng chỗ: tổng `confirmed` ≤ capacity (BR-MMP-06, khóa/kiểm tầng CSDL) |

### PASSPORT (rating F-01)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| userId | uuid PK | một player một passport |
| declaredTier | enum? | 5 bậc khai báo (MMP-09) |
| ratingMu | double | Glicko-2 μ |
| ratingRd | double | độ lệch RD (độ bất định) |
| ratingSigma | double | volatility σ |
| matchesPlayed | int | |
| updatedAt | timestamptz | |

### EVALUATION (đánh giá sau trận)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| matchId | uuid | tham chiếu MATCH cùng schema |
| raterUserId, rateeUserId | uuid | không tự đánh giá mình (BR-MMP-13) |
| perceivedTier | enum? / score | trình độ cảm nhận |
| labels | jsonb? | nhãn tinh thần thi đấu |
| flagged | boolean | F-07 đánh dấu bất thường |
| flagReason | text? | |
| countedAt | timestamptz? | mốc được tính vào rating (null nếu đang chờ duyệt) |
| createdAt | timestamptz | |
| — | | UNIQUE (matchId, raterUserId, rateeUserId) — một lượt đánh giá/cặp/kèo |

### Idempotency & outbox (như GĐ1)
- `Outbox`, `ProcessedEvent` (cùng mẫu GĐ1) trong schema `matchmaking`.

## 2. Schema `community` (service `community-service`)

### POST
| id uuid PK · authorUserId uuid · body text · status enum(published/hidden/removed) · createdAt · editedAt? |

### COMMENT
| id uuid PK · postId uuid FK→POST · authorUserId uuid · body text · status enum · createdAt |

### REPORT
| id uuid PK · reporterUserId uuid · targetType enum(post/comment) · targetId uuid · reason text · status enum(open/actioned/dismissed) · createdAt · UNIQUE(reporterUserId,targetType,targetId) — BR-COM-05 |

### TICKET
| id uuid PK · requesterUserId uuid · subject text · status enum(open/in_progress/resolved/closed) · createdAt |

### TICKET_MESSAGE
| id uuid PK · ticketId uuid FK→TICKET · senderUserId uuid · senderRole enum(player/admin) · body text · createdAt |

### MODERATION_AUDIT (append-only)
| id uuid PK · adminUserId uuid · action text · targetType · targetId · reason · createdAt — BR-COM-04 |

- `Outbox`, `ProcessedEvent` trong schema `community` (consume `AccountLocked`).

## 3. AI dùng chung qua `packages/ai` (không có schema/service riêng)

**PO chốt 2026-08-08:** AI giữ là thư viện TypeScript dùng chung theo ADR 0002. `packages/ai`
chỉ chứa client Gemini, interface và guardrail; không có port, migration, schema hay dữ liệu domain.
`matchmaking-service` gọi thư viện cho AI-01, còn `community-service` gọi cho AI-02.

Dữ liệu của chính user cho AI-02 (booking/ví/kèo) **không nhân bản**; service sở hữu dữ liệu truy
vấn phần của chính user theo `userId` qua API/event contract phù hợp rồi chỉ gửi ngữ cảnh đã lọc
vào thư viện. Không có truy vấn chéo schema và không đưa dữ liệu user khác vào prompt.

RAG policy/AI audit chỉ được thêm persistence khi PO chốt vector store; vị trí lưu phải thuộc
schema của service gọi AI hoặc một quyết định kiến trúc mới được PO phê duyệt, không tự tạo schema
`ai` trái ADR 0002.

## 4. Ràng buộc chung
- Không FK xuyên schema; mọi liên kết cross-service là giá trị tham chiếu.
- Tiền (phí kèo) KHÔNG lưu ở `matchmaking`; chỉ ở `finance` (ví platform reserved, ref matchId).
- Migration mỗi service riêng, chạy sạch trên DB rỗng + cách ly quyền schema (như G0 GĐ1).

## 5. Quyết định chờ PO chốt
1. **Đã chốt 2026-08-08:** AI là `packages/ai` dùng chung theo ADR 0002; không tạo `ai-service`
   hoặc schema `ai`.
2. Vector store cho RAG: cần PO chốt vị trí lưu tương thích với quyết định trên; không dùng
   schema `ai`. Đề xuất sẽ được trình trước P2-M9.
