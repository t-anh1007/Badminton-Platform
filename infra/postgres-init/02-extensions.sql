-- G3: btree_gist cần cho EXCLUDE constraint chống đặt trùng thật trên bảng
-- "holds" của venue_booking (BR-BOK-03) — kết hợp uuid equality (courtId) với
-- range overlap (tstzrange(startAt,endAt)) trong cùng một gist index.
-- Extension thuộc cấp DATABASE (không phải schema), cài một lần, mọi schema
-- dùng chung được — không vi phạm cô lập schema-per-service (D17), vì đây là
-- hạ tầng kiểu dữ liệu/toán tử của Postgres, không phải bảng/dữ liệu nghiệp vụ.
CREATE EXTENSION IF NOT EXISTS btree_gist;
