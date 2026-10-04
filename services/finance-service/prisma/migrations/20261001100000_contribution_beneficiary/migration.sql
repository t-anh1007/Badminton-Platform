-- BR-CM-77 (D58): slot trả thay — hoàn tiền về người trả, tiền kết quả trận về partner.
ALTER TABLE "match_contributions" ADD COLUMN "beneficiaryUserId" TEXT;
ALTER TABLE "match_contributions" ADD COLUMN "beneficiaryVersion" BIGINT NOT NULL DEFAULT 0;
