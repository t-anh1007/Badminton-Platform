-- ---------------------------------------------------------------------------
-- Gboot — Khởi tạo schema-per-service cho Postgres LOCAL (D17, ADR 0004).
-- Chạy tự động một lần khi container postgres tạo volume lần đầu
-- (docker-entrypoint-initdb.d), với quyền superuser trên DB `khoaluantn`.
--
-- Mỗi service nghiệp vụ = 1 schema + 1 role SỞ HỮU schema đó (AUTHORIZATION).
-- Role chỉ có quyền trên schema của mình; KHÔNG có USAGE trên schema service khác
-- => truy vấn xuyên schema bị Postgres từ chối ở tầng quyền.
-- api-gateway KHÔNG có schema/role (proxy thuần, không DB).
--
-- LƯU Ý Railway: managed Postgres có thể không cho CREATE ROLE/CREATEDB.
-- File này là provisioning LOCAL; Railway dùng script/quy trình riêng nhưng
-- phải giữ đúng schema/grant CONTRACT (cùng tên schema, cùng mô hình quyền).
-- CREATEDB dưới đây CHỈ để `prisma migrate dev` tạo được shadow DB ở local.
-- ---------------------------------------------------------------------------

-- Siết public: không cho role thường tạo object trong schema public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Hàm tiện ích tạo 1 cặp (role, schema) cô lập.
DO $$
DECLARE
  svc   text;
  pw    text;
  recs  text[][] := ARRAY[
    ARRAY['account_svc',      'account_pw',      'account'],
    ARRAY['venue_booking_svc','venue_booking_pw','venue_booking'],
    ARRAY['finance_svc',      'finance_pw',      'finance'],
    ARRAY['matchmaking_svc',  'matchmaking_pw',  'matchmaking'],
    ARRAY['community_svc',    'community_pw',    'community']
  ];
  r text[];
  schema_name text;
BEGIN
  FOREACH r SLICE 1 IN ARRAY recs LOOP
    svc         := r[1];
    pw          := r[2];
    schema_name := r[3];

    -- Role đăng nhập; CREATEDB chỉ để shadow DB của prisma migrate dev (local).
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L CREATEDB', svc, pw);

    -- Kết nối được vào DB.
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I',
                   current_database(), svc);

    -- Schema thuộc sở hữu của role => toàn quyền DDL/DML trong schema của mình.
    EXECUTE format('CREATE SCHEMA %I AUTHORIZATION %I', schema_name, svc);

    -- Không cấp USAGE trên public để tránh rò rỉ qua schema mặc định.
    EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', svc);
  END LOOP;
END $$;

-- Kết quả: account_svc chỉ thấy schema account; chạm venue_booking/finance/…
-- sẽ báo "permission denied for schema ...". Test cách ly (proof #6) kiểm điều này.
