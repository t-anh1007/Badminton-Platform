import { prisma } from '../src/lib/prisma.js';

/** Dọn dữ liệu test của hồ sơ kết quả; trigger append-only chỉ cho xóa trong phiên có cờ purge. */
export async function purgeResultCases(matchIds: string[], client: typeof prisma = prisma) {
  const caseIds = (await client.matchResultCase.findMany({ where: { matchId: { in: matchIds } }, select: { id: true } })).map((row) => row.id);
  if (caseIds.length === 0) return caseIds;
  await client.$transaction([
    client.$executeRaw`SET LOCAL app.result_audit_purge = 'on'`,
    client.evidenceReading.deleteMany({ where: { upload: { caseId: { in: caseIds } } } }),
    client.resultUpload.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.aiRuling.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.resultAppeal.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.playerViolation.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.aiCallLog.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.resultEvidence.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.resultSet.deleteMany({ where: { claim: { caseId: { in: caseIds } } } }),
    client.resultClaim.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.resultResponse.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.providerRecommendation.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.adminResultDecision.deleteMany({ where: { caseId: { in: caseIds } } }),
    client.matchResultCase.deleteMany({ where: { id: { in: caseIds } } }),
  ]);
  return caseIds;
}
