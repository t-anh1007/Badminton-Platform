-- CreateEnum
CREATE TYPE "ResultCaseStatus" AS ENUM ('declaration_open', 'provisional', 'incident_window', 'provider_review', 'admin_review', 'final');

-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('TEAM_A_WIN', 'TEAM_B_WIN', 'NO_RESULT');

-- CreateEnum
CREATE TYPE "ResultResponseKind" AS ENUM ('confirm', 'object', 'incident');

-- CreateEnum
CREATE TYPE "ResultIncidentType" AS ENUM ('no_show', 'not_played', 'interrupted', 'other');

-- CreateTable
CREATE TABLE "match_result_cases" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "status" "ResultCaseStatus" NOT NULL DEFAULT 'declaration_open',
    "outcome" "MatchOutcome",
    "declarationDeadlineAt" TIMESTAMPTZ(3) NOT NULL,
    "objectionDeadlineAt" TIMESTAMPTZ(3),
    "teamGraceDeadlineAt" TIMESTAMPTZ(3),
    "incidentDeadlineAt" TIMESTAMPTZ(3),
    "providerDeadlineAt" TIMESTAMPTZ(3),
    "adminReviewStartedAt" TIMESTAMPTZ(3),
    "adminNextReminderAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "match_result_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_claims" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "claimantUserId" TEXT NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "setWinsA" INTEGER NOT NULL,
    "setWinsB" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_sets" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "teamA" INTEGER NOT NULL,
    "teamB" INTEGER NOT NULL,

    CONSTRAINT "result_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_responses" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ResultResponseKind" NOT NULL,
    "incidentType" "ResultIncidentType",
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_evidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "claimId" TEXT,
    "responseId" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "result_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_recommendations" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_result_decisions" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "outcome" "MatchOutcome" NOT NULL,
    "reason" TEXT NOT NULL,
    "caseVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_result_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_result_cases_matchId_key" ON "match_result_cases"("matchId");

-- CreateIndex
CREATE INDEX "match_result_cases_status_declarationDeadlineAt_idx" ON "match_result_cases"("status", "declarationDeadlineAt");

-- CreateIndex
CREATE INDEX "match_result_cases_status_objectionDeadlineAt_idx" ON "match_result_cases"("status", "objectionDeadlineAt");

-- CreateIndex
CREATE INDEX "match_result_cases_closedAt_idx" ON "match_result_cases"("closedAt");

-- CreateIndex
CREATE INDEX "result_claims_caseId_createdAt_idx" ON "result_claims"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "result_sets_claimId_position_key" ON "result_sets"("claimId", "position");

-- CreateIndex
CREATE INDEX "result_responses_caseId_createdAt_idx" ON "result_responses"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "result_evidence_caseId_ownerUserId_idx" ON "result_evidence"("caseId", "ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "result_evidence_caseId_objectKey_key" ON "result_evidence"("caseId", "objectKey");

-- CreateIndex
CREATE INDEX "provider_recommendations_caseId_createdAt_idx" ON "provider_recommendations"("caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_result_decisions_caseId_key" ON "admin_result_decisions"("caseId");

-- AddForeignKey
ALTER TABLE "match_result_cases" ADD CONSTRAINT "match_result_cases_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_claims" ADD CONSTRAINT "result_claims_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_sets" ADD CONSTRAINT "result_sets_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "result_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_responses" ADD CONSTRAINT "result_responses_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_evidence" ADD CONSTRAINT "result_evidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_evidence" ADD CONSTRAINT "result_evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "result_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_evidence" ADD CONSTRAINT "result_evidence_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "result_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_recommendations" ADD CONSTRAINT "provider_recommendations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_result_decisions" ADD CONSTRAINT "admin_result_decisions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "match_result_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- BR-CM-26/42: claim, set, response, provider recommendation và admin decision là
-- append-only. Evidence chỉ được đánh dấu deletedAt một lần bởi retention.
CREATE FUNCTION "reject_result_audit_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'RESULT_AUDIT_IMMUTABLE: % is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "result_claims_immutable" BEFORE UPDATE ON "result_claims" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "result_sets_immutable" BEFORE UPDATE ON "result_sets" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "result_responses_immutable" BEFORE UPDATE ON "result_responses" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "provider_recommendations_immutable" BEFORE UPDATE ON "provider_recommendations" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();
CREATE TRIGGER "admin_result_decisions_immutable" BEFORE UPDATE ON "admin_result_decisions" FOR EACH ROW EXECUTE FUNCTION "reject_result_audit_update"();

CREATE FUNCTION "guard_result_evidence_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL
     AND (to_jsonb(NEW) - 'deletedAt') = (to_jsonb(OLD) - 'deletedAt') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'RESULT_EVIDENCE_IMMUTABLE: committed evidence cannot change';
END;
$$;

CREATE TRIGGER "result_evidence_immutable" BEFORE UPDATE ON "result_evidence" FOR EACH ROW EXECUTE FUNCTION "guard_result_evidence_update"();

ALTER TABLE "result_evidence"
  ADD CONSTRAINT "result_evidence_single_parent" CHECK ("claimId" IS NULL OR "responseId" IS NULL),
  ADD CONSTRAINT "result_evidence_size_bounds" CHECK ("size" BETWEEN 1 AND 5242880);
