-- Spec kèo cạnh tranh §11: email giao dịch bắt buộc gửi sau khi inbox đã ghi; null = chưa gửi thành công.
ALTER TABLE "notifications" ADD COLUMN "emailLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "emailSentAt" TIMESTAMP(3);
