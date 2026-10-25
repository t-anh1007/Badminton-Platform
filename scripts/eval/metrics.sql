-- Số liệu NCKH cho luồng quét ảnh tỉ số (spec result-ocr-autoconfirm.md §10). Chạy trên schema "matchmaking":
--   psql "$MATCHMAKING_DATABASE_URL" -f scripts/eval/metrics.sql
-- Chỉ tính hồ sơ ra_v1; dữ liệu là dữ liệu giả của team (BR-RA-61).

-- 1. Tỷ lệ Xanh/Vàng/Đỏ theo bản khai và theo ảnh.
SELECT 'claim' AS unit, c.level, count(*) AS n, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM result_claims c JOIN match_result_cases r ON r.id = c."caseId"
WHERE r."rulesVersion" = 'ra_v1' AND c.purpose = 'claim' AND c.level IS NOT NULL
GROUP BY c.level
UNION ALL
SELECT 'photo', e.level, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1)
FROM result_evidence e JOIN match_result_cases r ON r.id = e."caseId"
WHERE r."rulesVersion" = 'ra_v1' AND e.level IS NOT NULL
GROUP BY e.level
ORDER BY unit, level;

-- 2. Thời gian từ endAt tới final (giờ), so sánh hai luồng.
SELECT r."rulesVersion", count(*) AS cases,
       round(avg(extract(epoch FROM r."finalizedAt" - m."endAt") / 3600)::numeric, 2) AS avg_hours,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM r."finalizedAt" - m."endAt") / 3600))::numeric, 2) AS median_hours
FROM match_result_cases r JOIN matches m ON m.id = r."matchId"
WHERE r.status = 'final' AND r."finalizedAt" IS NOT NULL AND m."endAt" IS NOT NULL
GROUP BY r."rulesVersion";

-- 3. Hồ sơ tranh chấp được xử ở tầng 1 / tầng 2 / Admin (theo kết quả tạm đã công bố và quyết định Admin).
WITH disputed AS (
  SELECT r.id,
         EXISTS (SELECT 1 FROM ai_rulings a WHERE a."caseId" = r.id AND a.tier = 1 AND a."publishedAt" IS NOT NULL) AS tier1,
         EXISTS (SELECT 1 FROM ai_rulings a WHERE a."caseId" = r.id AND a.tier = 2 AND a."publishedAt" IS NOT NULL) AS tier2,
         EXISTS (SELECT 1 FROM admin_result_decisions d WHERE d."caseId" = r.id) AS admin
  FROM match_result_cases r
  WHERE r."rulesVersion" = 'ra_v1' AND r."evidenceDeadlineAt" IS NOT NULL
)
SELECT count(*) AS disputes,
       count(*) FILTER (WHERE tier1 AND NOT admin) AS closed_tier1,
       count(*) FILTER (WHERE tier2 AND NOT admin) AS closed_tier2,
       count(*) FILTER (WHERE admin) AS went_admin
FROM disputed;

-- 4. Kháng nghị: tổng, bị từ chối vì thiếu căn cứ, Admin đánh giá không căn cứ, phán quyết tạm bị lật.
SELECT count(*) AS appeals,
       count(*) FILTER (WHERE NOT accepted) AS rejected_no_grounds,
       count(*) FILTER (WHERE "adminGrounded" = false) AS admin_groundless
FROM result_appeals;
SELECT tier, count(*) FILTER (WHERE "publishedAt" IS NOT NULL) AS published,
       count(*) FILTER (WHERE "appealedAt" IS NOT NULL) AS appealed,
       count(*) FILTER (WHERE overturned) AS overturned
FROM ai_rulings GROUP BY tier ORDER BY tier;

-- 5. Gọi AI: số lần, tỷ lệ lỗi, rơi xuống mắt xích dự phòng (chainIndex > 0 mà thành công), độ trễ, token.
SELECT purpose, provider, model, count(*) AS calls,
       count(*) FILTER (WHERE NOT ok) AS failed,
       count(*) FILTER (WHERE ok AND "chainIndex" > 0) AS fallback_success,
       round((percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs"))::numeric) AS median_ms,
       round(avg(coalesce("tokensIn", 0) + coalesce("tokensOut", 0))::numeric) AS avg_tokens
FROM ai_call_logs
GROUP BY purpose, provider, model
ORDER BY purpose, calls DESC;
