-- Ví người chơi: gộp một số dư, rút tối đa 1.000.000đ/ngày miễn phí, phần vượt chịu phí 1%.
ALTER TABLE "withdrawal_requests" ADD COLUMN "fee" BIGINT NOT NULL DEFAULT 0;
