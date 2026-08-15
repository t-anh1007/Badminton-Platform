-- D41 makes the evaluation window measurable from the authoritative booking completion event.
ALTER TABLE "matches" ADD COLUMN "completedAt" TIMESTAMPTZ(3);

CREATE TYPE "EvaluationReviewStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "evaluations"
  ADD COLUMN "reviewStatus" "EvaluationReviewStatus",
  ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "reviewedByUserId" TEXT;

CREATE INDEX "evaluations_raterUserId_rateeUserId_perceivedTier_createdAt_idx"
  ON "evaluations"("raterUserId", "rateeUserId", "perceivedTier", "createdAt");
