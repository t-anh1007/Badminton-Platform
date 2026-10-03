-- BR-CM-71..78 (D58): mời partner vào slot Team A kèo đôi, tự trả hoặc chủ kèo trả thay.
ALTER TYPE "JoinStatus" ADD VALUE 'reserved';
ALTER TABLE "joins" ADD COLUMN "payerUserId" TEXT;

CREATE TYPE "PartnerPayMode" AS ENUM ('self', 'organizer');
CREATE TYPE "PartnerInviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

CREATE TABLE "partner_invites" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "inviteeUserId" TEXT NOT NULL,
    "payMode" "PartnerPayMode" NOT NULL,
    "status" "PartnerInviteStatus" NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMPTZ(3),
    "respondedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_invites_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_invites_matchId_status_idx" ON "partner_invites"("matchId", "status");
CREATE INDEX "partner_invites_inviteeUserId_status_idx" ON "partner_invites"("inviteeUserId", "status");
ALTER TABLE "partner_invites" ADD CONSTRAINT "partner_invites_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
