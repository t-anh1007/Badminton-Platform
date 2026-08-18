---
name: demo-smoke
description: Dựng dữ liệu demo và smoke-test các luồng chính của web trong browser. Dùng khi PO nói "test trong browser", "dữ liệu demo", "tài khoản demo", "chuẩn bị demo", "chuẩn bị bảo vệ".
---

# Demo & Smoke Test — dựng dữ liệu và kiểm tra luồng chính

Việc lặp lại nhiều nhất ở GĐ3: có dữ liệu xem được, bấm thử được, chụp được
bằng chứng. Skill này chuẩn hóa toàn bộ.

## Đầu vào

- Môi trường: local (mặc định) hay production (Railway/Vercel — chỉ đọc + tài
  khoản demo, không seed bừa vào prod; prod dùng `scripts/prod-seed.ts` và phải
  hỏi PO trước).
- Phạm vi luồng cần test (mặc định: toàn bộ bảng ở bước 4).

## Các bước (local)

1. **Hạ tầng**: `npm run infra:up` (PostgreSQL/Redis/RabbitMQ qua docker).
   Schema mới chưa migrate → `npm run prisma:migrate`.
2. **Seed dữ liệu demo**:
   ```bash
   npx dotenv -e .env -- npx tsx scripts/demo-seed.ts
   ```
   - Mọi bản ghi demo gắn tiền tố `demo-`/`DEMO`; xóa sạch bằng
     `scripts/demo-cleanup.ts` (cùng cách chạy).
   - Chỉ cần tài khoản, không cần dữ liệu: `scripts/demo-accounts.ts`
     (chạy bằng `node --experimental-strip-types` qua dotenv cũng được).
3. **Chạy app**: services bằng `npm run dev` (background, đủ 6 service);
   frontend qua preview_start cấu hình `frontend` trong `.claude/launch.json`
   (Vite, port 5173). Không chạy dev server bằng Bash thường.
4. **Smoke các luồng lõi** trong browser pane, mỗi luồng chụp screenshot:

   | Luồng | Tài khoản | Điểm phải thấy |
   |---|---|---|
   | Đăng nhập | cả 3 role | vào được, đúng menu theo role |
   | Tìm sân + bản đồ | player@demo.vn | danh sách, ảnh cover hiển thị, map leaflet |
   | Đặt sân | player@demo.vn | chọn ca → hold → QR SePay hiện, poll tới hết hạn hold |
   | Ví | player@demo.vn | số dư, lịch sử giao dịch |
   | Quản lý sân | owner@demo.vn | tạo/sửa venue, ảnh thumbnail, lịch sân |
   | Ghép kèo | player@demo.vn | tạo kèo theo bậc trình độ (5 bậc), realtime cập nhật |
   | Cộng đồng | player@demo.vn | đăng bài kèm ảnh, ảnh hiển thị |
   | Admin | admin@demo.vn | duyệt provider, đối soát SePay |

   Tài khoản demo: `admin@demo.vn` / `player@demo.vn` / `owner@demo.vn`,
   mật khẩu chung `Demo@123456`.
5. **Soát lỗi ngầm**: đọc console messages và network requests của browser
   pane sau mỗi luồng; lỗi 4xx/5xx hoặc console error đều phải ghi nhận.
6. **Dọn dẹp** (khi PO muốn): chạy `demo-cleanup.ts`.

## Đầu ra

Bảng luồng với ✅/❌ + screenshot bằng chứng cho từng luồng, danh sách lỗi tìm
thấy kèm bước tái hiện. Nếu PO chỉ yêu cầu test thì **báo cáo lỗi, không tự
sửa** — chờ PO quyết.
