-- Mùa giải hai hạng đấu (Không chuyên / Chuyên) khóa ở trận xếp hạng đầu tiên, và điểm BXH mùa tách khỏi điểm kinh nghiệm.
CREATE TYPE "SeasonDivision" AS ENUM ('amateur', 'pro');

ALTER TABLE "season_stats" ADD COLUMN "division" "SeasonDivision";
ALTER TABLE "season_stats" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;

-- Hạng đấu của số liệu cũ: điểm kinh nghiệm trước trận xếp hạng đầu tiên trong mùa; thiếu lịch sử thì lấy điểm hiện tại.
UPDATE "season_stats" s SET "division" = CASE WHEN f."ratingBefore" >= 1600 THEN 'pro'::"SeasonDivision" ELSE 'amateur'::"SeasonDivision" END
FROM (
  SELECT DISTINCT ON (se.id, c."userId", c.discipline) se.id AS "seasonId", c."userId", c.discipline, c."ratingBefore"
  FROM match_rating_changes c
  JOIN matches m ON m.id = c."matchId" AND m.mode = 'ranked'
  JOIN seasons se ON m."endAt" >= se."startAt" AND m."endAt" < se."endAt"
  ORDER BY se.id, c."userId", c.discipline, m."endAt", c."createdAt"
) f
WHERE f."seasonId" = s."seasonId" AND f."userId" = s."userId" AND f.discipline = s.discipline;

UPDATE "season_stats" s SET "division" = CASE WHEN p."ratingMu" >= 1600 THEN 'pro'::"SeasonDivision" ELSE 'amateur'::"SeasonDivision" END
FROM passports p WHERE s."division" IS NULL AND p."userId" = s."userId" AND p.discipline = s.discipline;

-- Điểm BXH của số liệu cũ: xấp xỉ ngang trình (thắng +20, thua -20), sàn 0.
UPDATE "season_stats" SET "points" = GREATEST(0, 20 * (2 * wins - "matchesPlayed"));

-- Chương trình thưởng: nhóm theo hạng đấu thay cho mốc rating 1600.
UPDATE "reward_programs" SET band = CASE band WHEN 'from_1600' THEN 'pro' ELSE 'amateur' END;
