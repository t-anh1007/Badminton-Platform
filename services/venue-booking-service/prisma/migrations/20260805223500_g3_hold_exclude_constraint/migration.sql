-- G3 — BR-BOK-03: "Không tồn tại hai booking confirmed trùng (courtId,
-- timeRange). Thực thi bằng ràng buộc loại trừ ở tầng CSDL cộng khóa khi tạo
-- hold, không chỉ kiểm tra ở tầng ứng dụng."
--
-- EXCLUDE constraint không chấp nhận hàm/cast volatile trong biểu thức index
-- (predicate hay expression đều phải IMMUTABLE). Ban đầu thử trên cột
-- "timestamp" (không timezone) thất bại vì cast ngầm timestamp->timestamptz
-- phụ thuộc timezone phiên (STABLE, không IMMUTABLE) — đã sửa bằng cách đổi
-- toàn bộ cột liên quan sang timestamptz ở migration g3_timestamptz trước đó.
--
-- Không điều kiện theo expiresAt > now() được (now() cũng volatile) — EXCLUDE
-- vô điều kiện trên MỌI dòng, kết hợp tầng ứng dụng LUÔN xóa (reap) hold hết
-- hạn TRONG CÙNG transaction trước khi insert hold mới (xem
-- src/domain/hold.ts), nên các dòng còn lại trong bảng luôn là hold hiệu lực.
--
-- courtId (uuid) dùng "=" trong gist index cần btree_gist (cài ở
-- infra/postgres-init/02-extensions.sql, cấp database).
ALTER TABLE "holds"
  ADD CONSTRAINT "holds_no_overlap"
  EXCLUDE USING gist (
    "courtId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  );

-- Cùng lý do, booking confirmed cũng không được chồng lấn nhau — ràng buộc
-- bất biến #4. Chỉ áp cho status='confirmed' (predicate hằng số, hợp lệ).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_confirmed_no_overlap"
  EXCLUDE USING gist (
    "courtId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE (status = 'confirmed'::"BookingStatus");
