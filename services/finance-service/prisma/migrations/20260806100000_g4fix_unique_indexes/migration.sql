-- G4-fix (Codex review D22): hai ràng buộc bất biến tài chính ở tầng CSDL.

-- D16: ví `platform` là DUY NHẤT toàn hệ thống. Unique (userId, walletType) của
-- Prisma KHÔNG chặn được vì userId=NULL cho platform, mà Postgres coi mỗi NULL
-- là khác nhau -> nhiều ví platform có thể cùng tồn tại. Partial unique index
-- này đảm bảo tối đa MỘT hàng walletType='platform'.
CREATE UNIQUE INDEX IF NOT EXISTS wallets_platform_singleton
  ON wallets ("walletType")
  WHERE "walletType" = 'platform';

-- FIN-03 chống double-pay: mỗi booking chỉ có ĐÚNG MỘT bút toán `payment`. Hai
-- request trả cùng booking đồng thời -> chỉ một commit được, cái thứ hai vi phạm
-- unique và rollback, không phát PaymentCompleted lần hai. (Kết hợp SELECT FOR
-- UPDATE khóa ví trong postLedgerEntry.)
CREATE UNIQUE INDEX IF NOT EXISTS ledger_payment_once
  ON ledger_entries ("refType", "refId", type)
  WHERE type = 'payment';
