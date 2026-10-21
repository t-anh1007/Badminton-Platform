-- CreateEnum
CREATE TYPE "ResultRulesVersion" AS ENUM ('legacy', 'ra_v1');

-- CreateEnum
CREATE TYPE "ResultLevel" AS ENUM ('green', 'yellow', 'red');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResultCaseStatus" ADD VALUE 'proposed';
ALTER TYPE "ResultCaseStatus" ADD VALUE 'acceptance_grace';
ALTER TYPE "ResultCaseStatus" ADD VALUE 'evidence_window';
ALTER TYPE "ResultCaseStatus" ADD VALUE 'rule_ruling';
ALTER TYPE "ResultCaseStatus" ADD VALUE 'ai_ruling';
ALTER TYPE "ResultCaseStatus" ADD VALUE 'appeal_window';

-- AlterTable
ALTER TABLE "match_result_cases" ADD COLUMN     "appealDeadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "evidenceClosedAt" TIMESTAMPTZ(3),
ADD COLUMN     "evidenceDeadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "graceDeadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "pendingRuling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "responseDeadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "responseDeadlineBaseAt" TIMESTAMPTZ(3),
ADD COLUMN     "rulesVersion" "ResultRulesVersion" NOT NULL DEFAULT 'legacy',
ADD COLUMN     "rulingRetryUntil" TIMESTAMPTZ(3);

-- T8: mọi hồ sơ có sẵn giữ luật cũ ('legacy' ở trên); hồ sơ tạo sau migration dùng luật mới.
ALTER TABLE "match_result_cases" ALTER COLUMN "rulesVersion" SET DEFAULT 'ra_v1';

-- AlterTable
ALTER TABLE "result_claims" ADD COLUMN     "columnMappedBy" TEXT,
ADD COLUMN     "draftId" TEXT,
ADD COLUMN     "editedCells" JSONB,
ADD COLUMN     "level" "ResultLevel",
ADD COLUMN     "levelReasons" JSONB,
ADD COLUMN     "manualEntry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'claim',
ADD COLUMN     "supersedesClaimId" TEXT;

-- AlterTable
ALTER TABLE "result_evidence" ADD COLUMN     "capturedAt" TIMESTAMPTZ(3),
ADD COLUMN     "dhash" TEXT,
ADD COLUMN     "exactDuplicateOfId" TEXT,
ADD COLUMN     "level" "ResultLevel",
ADD COLUMN     "levelReasons" JSONB,
ADD COLUMN     "nearDuplicateOfId" TEXT,
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'claim',
ADD COLUMN     "supports" "MatchOutcome",
ADD COLUMN     "uploadId" TEXT;

-- CreateTable
CREATE TABLE "result_uploads" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "capturedAt" TIMESTAMPTZ(3),
    "capturedAtSource" TEXT NOT NULL,
    "dhash" TEXT NOT NULL,
    "exactDuplicateOfId" TEXT,
    "nearDuplicateOfId" TEXT,
    "isScreenshot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_readings" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reading" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "chainIndex" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_rulings" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "reasons" JSONB NOT NULL,
    "adminNotes" TEXT,
    "citations" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "model" TEXT,
    "latencyMs" INTEGER,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),
    "appealedAt" TIMESTAMPTZ(3),
    "finalOutcome" "MatchOutcome",
    "overturned" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_rulings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_appeals" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "rulingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "pointedReason" TEXT,
    "evidenceIds" JSONB NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "adminGrounded" BOOLEAN,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_violations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "text")) STORED,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_logs" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "chainIndex" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "caseId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "result_uploads_objectKey_key" ON "result_uploads"("objectKey");

-- CreateIndex
CREATE INDEX "result_uploads_caseId_userId_idx" ON "result_uploads"("caseId", "userId");

-- CreateIndex
CREATE INDEX "result_uploads_draftId_idx" ON "result_uploads"("draftId");

-- CreateIndex
CREATE INDEX "evidence_readings_uploadId_createdAt_idx" ON "evidence_readings"("uploadId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_rulings_caseId_createdAt_idx" ON "ai_rulings"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "result_appeals_caseId_createdAt_idx" ON "result_appeals"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "player_violations_userId_createdAt_idx" ON "player_violations"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "player_violations_userId_caseId_key" ON "player_violations"("userId", "caseId");

-- CreateIndex
CREATE INDEX "knowledge_chunks_kind_active_idx" ON "knowledge_chunks"("kind", "active");

-- CreateIndex
CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING GIN ("tsv");

-- CreateIndex
CREATE INDEX "ai_call_logs_purpose_createdAt_idx" ON "ai_call_logs"("purpose", "createdAt");

-- CreateIndex
CREATE INDEX "result_evidence_checksumSha256_idx" ON "result_evidence"("checksumSha256");

-- AddForeignKey
ALTER TABLE "result_uploads" ADD CONSTRAINT "result_uploads_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_readings" ADD CONSTRAINT "evidence_readings_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "result_uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_rulings" ADD CONSTRAINT "ai_rulings_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_appeals" ADD CONSTRAINT "result_appeals_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- T6: bảng mới chỉ ghi thêm, dùng lại hàm trigger có sẵn; trigger của result_claims/result_evidence giữ nguyên.
CREATE TRIGGER "result_uploads_immutable" BEFORE UPDATE ON "result_uploads" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "evidence_readings_immutable" BEFORE UPDATE ON "evidence_readings" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "player_violations_immutable" BEFORE UPDATE ON "player_violations" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();

-- Kháng nghị chỉ ghi thêm; ngoại lệ duy nhất: Admin đánh dấu có/không có căn cứ đúng một lần (BR-RA-39).
CREATE FUNCTION "guard_result_appeal_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."adminGrounded" IS NULL AND NEW."adminGrounded" IS NOT NULL
     AND (to_jsonb(NEW) - 'adminGrounded') = (to_jsonb(OLD) - 'adminGrounded') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RESULT_AUDIT_IMMUTABLE: % is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "result_appeals_immutable" BEFORE UPDATE ON "result_appeals" FOR EACH ROW EXECUTE FUNCTION "guard_result_appeal_update"();
