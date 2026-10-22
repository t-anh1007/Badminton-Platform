import type { ResultCaseV2, ResultClaimView } from '../../lib/resultApi';

// Hồ sơ ra_v1 giả cho test giao diện; mặc định: Tuấn Anh (đội A) xem, chưa ai khai.

const person = (userId: string, displayName: string) => ({ userId, displayName, avatarUrl: null });
export const vn = (local: string) => new Date(`${local}+07:00`).toISOString();

export const claimView = (patch: Partial<ResultClaimView> = {}): ResultClaimView => ({
  id: 'c1', claimantUserId: 'a1', side: 'A', outcome: 'TEAM_A_WIN', level: 'yellow', reasons: ['EDITED_CELL'],
  sets: [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 16 }], editedCells: [{ set: 2, side: 'B' }],
  manualEntry: false, columnMappedBy: 'user', createdAt: vn('2026-10-22T20:12:00'),
  images: [{
    id: 'e1', mimeType: 'image/jpeg', level: 'green', flags: [], capturedAt: vn('2026-10-22T19:58:00'),
    aiReading: { boards: 1, isScreenshot: false, columns: { left: null, right: null }, unreadable: false, sets: [{ index: 3, left: 21, right: 15, confLeft: 0.97, confRight: 0.95 }] },
  }],
  ...patch,
});

export function photoCase(patch: Partial<ResultCaseV2> = {}): ResultCaseV2 {
  return {
    matchId: 'm1', serverNow: vn('2026-10-22T20:05:00'), status: 'declaration_open', finalOutcome: null,
    declarationDeadlineAt: vn('2026-10-23T08:00:00'), objectionDeadlineAt: null, teamGraceDeadlineAt: null,
    match: {
      discipline: 'doubles', mode: 'ranked', format: 'bo3', ratio: '7:3', startAt: vn('2026-10-22T18:00:00'), endAt: vn('2026-10-22T20:00:00'),
      venue: { name: 'Sân Linh Xuân', address: 'Thủ Đức' }, court: { name: 'Sân 3' },
      teams: [
        { side: 'A', players: [person('a1', 'Tuấn Anh'), person('a2', 'Minh Khôi')] },
        { side: 'B', players: [person('b1', 'Lan Phương'), person('b2', 'Đức Phúc')] },
      ],
    },
    provisional: null, viewerMoney: null,
    rulesVersion: 'ra_v1', version: 1, level: null, reasons: [],
    responseDeadlineBaseAt: null, responseDeadlineAt: null, graceDeadlineAt: null, evidenceDeadlineAt: null, evidenceClosedAt: null, appealDeadlineAt: null,
    proposalClaimId: null, claims: [], ruling: null, disputeEvidence: [],
    viewerActions: {
      canUpload: true, canClaim: true, canReplace: false, canConfirm: false, canObject: false, canReportIncident: true,
      canSubmitEvidence: false, canAppeal: false, canAcceptRuling: false, canMarkEvidenceDone: false,
    },
    viewerSide: 'A', responses: [], pendingPayerUserId: null, viewerQuota: { photosUsed: 0, photosLimit: 7, draftsLeft: 15 },
    viewerAppeal: null, adminReason: null, adminReviewStartedAt: null, evidenceDoneSides: [],
    ...patch,
  };
}

/** Đội A đã khai (Vàng), đội B đang xem và còn hạn phản hồi đã dời qua đêm. */
export const proposedCase = (patch: Partial<ResultCaseV2> = {}) => photoCase({
  status: 'proposed', level: 'yellow', reasons: ['EDITED_CELL'], proposalClaimId: 'c1', claims: [claimView()],
  responseDeadlineBaseAt: vn('2026-10-23T02:12:00'), responseDeadlineAt: vn('2026-10-23T08:00:00'),
  viewerSide: 'B',
  viewerActions: {
    canUpload: true, canClaim: true, canReplace: false, canConfirm: true, canObject: true, canReportIncident: true,
    canSubmitEvidence: false, canAppeal: false, canAcceptRuling: false, canMarkEvidenceDone: false,
  },
  ...patch,
});
