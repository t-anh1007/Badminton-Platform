import type { Prisma } from '@prisma/client';
import { deadlineFor, resultWindows } from './deadlines.js';
import { notifyRoster } from './matchResults.js';
import { vnClock, type CaseContext } from './resultClaimsV2.js';

// Tranh chấp tỉ số tầng 1 (BR-RA-30..34a) cho hồ sơ ra_v1.

type Tx = Prisma.TransactionClient;

/** BR-RA-30: mở 2 giờ nộp bằng chứng kín cho cả roster (hạn giãn qua đêm). */
export async function openEvidenceWindow(tx: Tx, ctx: CaseContext, now: Date) {
  const deadline = deadlineFor(now, resultWindows().evidence);
  await tx.matchResultCase.update({
    where: { id: ctx.resultCase.id },
    data: { status: 'evidence_window', evidenceDeadlineAt: deadline.at, evidenceClosedAt: null, version: { increment: 1 } },
  });
  await notifyRoster(tx, ctx.match, ctx.resultCase.id, 'match.result.disputed', 'Kết quả trận đang tranh chấp',
    `Hai bên có tới ${vnClock(deadline.at)} để nộp ảnh bằng chứng; ảnh được giữ kín tới khi hết hạn. Tiền giữ cho kết quả tạm khóa.`);
}
