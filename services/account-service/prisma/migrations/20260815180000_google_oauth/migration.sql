-- Google OAuth: cho phép user tạo qua Google không có password_hash,
-- và thêm google_sub để nhận diện lại tài khoản Google.

ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "users_googleSub_key" ON "users"("googleSub");
