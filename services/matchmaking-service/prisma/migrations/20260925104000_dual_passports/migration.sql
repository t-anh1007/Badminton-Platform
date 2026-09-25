-- BR-CM-44: Passport tách singles/doubles. Mọi Passport hiện có (rating, RD, sigma,
-- matchesPlayed, bậc khai) được giữ nguyên làm singles.
ALTER TABLE "passports" ADD COLUMN "discipline" "MatchDiscipline" NOT NULL DEFAULT 'singles';
ALTER TABLE "passports" ALTER COLUMN "discipline" DROP DEFAULT;
ALTER TABLE "passports" DROP CONSTRAINT "passports_pkey";
ALTER TABLE "passports" ADD CONSTRAINT "passports_pkey" PRIMARY KEY ("userId", "discipline");
