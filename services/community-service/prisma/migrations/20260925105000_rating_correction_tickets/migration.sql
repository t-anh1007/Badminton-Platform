-- BR-CM-53/54: ticket sửa khai báo trình độ dùng chung bảng tickets hiện có.
CREATE TYPE "TicketType" AS ENUM ('general', 'rating_correction');

ALTER TABLE "tickets" ADD COLUMN "correctionDecision" JSONB,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "type" "TicketType" NOT NULL DEFAULT 'general';
