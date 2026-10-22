import { useEffect, useState } from 'react';
import { readResultEvidence, type ReviewCaseDetail } from '../../../lib/matchApi';
import type { AdminAppeal, AdminClaimView, AdminPhotoView, AdminReason, AdminRuling, AdminViolationKind, Reputation } from '../../../lib/resultApi';
import { formatTimeVi } from '../../../lib/formatters.js';
import { Badge, Modal } from '../../ui';
import { LevelBadge, outcomeText, shortTime } from '../shared';

// A2/A3: phần riêng của hồ sơ luồng ảnh trong màn xử của Admin. Admin thấy cả lý do nội bộ và uy tín (BR-RA-53).

export interface PhotoCaseExtras {
  rulesVersion: 'ra_v1'; adminReason: AdminReason | null; claimViews: AdminClaimView[]; rulings: AdminRuling[]; appeals: AdminAppeal[];
  reputations: Record<string, Reputation>;
}
export const isPhotoReview = (detail: ReviewCaseDetail): detail is ReviewCaseDetail & PhotoCaseExtras =>
  (detail as Partial<PhotoCaseExtras>).rulesVersion === 'ra_v1';

export const ADMIN_REASON_LABEL: Record<AdminReason, string> = {
  unknown_photo: 'Ảnh lạ', appeal: 'Kháng nghị', ai_unavailable: 'AI không đủ chắc', evidence_unreadable: 'Ảnh chưa đọc được',
  incident: 'Sự cố', legacy: 'Hồ sơ cũ',
};
export const VIOLATION_LABEL: Record<AdminViolationKind, string> = {
  false_claim: 'Khai sai cố ý', near_duplicate_fraud: 'Ảnh gần trùng là gian lận', false_incident: 'Báo sự cố sai',
};
const REPUTATION_LABEL: Record<Reputation, { text: string; tone: 'success' | 'warning' | 'danger' }> = {
  good: { text: 'Tốt', tone: 'success' }, watch: { text: 'Cần chú ý', tone: 'warning' }, low: { text: 'Thấp', tone: 'danger' },
};
/** Admin thấy mọi mã lý do, kể cả mã nội bộ không bao giờ hiện cho người chơi. */
const ADMIN_REASON_TEXT: Record<string, string> = {
  EXACT_DUPLICATE: 'Trùng chính xác ảnh hồ sơ khác', CAPTURED_BEFORE_START: 'Chụp trước giờ đánh', NO_CAPTURE_TIME: 'Không có giờ chụp',
  CAPTURED_LATE: 'Chụp muộn', NEAR_DUPLICATE: 'Gần trùng ảnh hồ sơ khác', MULTIPLE_BOARDS: 'Nhiều bảng điểm', AI_UNAVAILABLE: 'AI không đọc được',
  LOW_CELL_CONFIDENCE: 'AI chưa chắc', MANUAL_SET: 'Set nhập tay', SET_IMAGES_CONFLICT: 'Ảnh cùng set lệch nhau',
  USER_COLUMN_MAPPING: 'Tự chọn cột', EDITED_CELL: 'Sửa số AI đọc', REPORTER_LOW_REPUTATION: 'Người khai uy tín Thấp (nội bộ)',
};

function PhotoInspector({ matchId, photo, owner, onClose }: { matchId: string; photo: AdminPhotoView | null; owner: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const photoId = photo?.id;
  useEffect(() => {
    setUrl(null);
    if (!photoId) return;
    let active = true;
    readResultEvidence(matchId, photoId).then((result) => { if (active) setUrl(result.url); }, () => undefined);
    return () => { active = false; };
  }, [matchId, photoId]);
  if (!photo) return null;
  const sets = photo.ai?.reading?.sets ?? [];
  const signals: Array<{ ok: boolean; text: string }> = [
    { ok: photo.capturedAt !== null, text: photo.capturedAt ? `Giờ chụp ${formatTimeVi(photo.capturedAt)} (thông tin file)` : 'Không có giờ chụp' },
    { ok: !photo.exactDuplicateOf, text: photo.exactDuplicateOf ? `Trùng chính xác ảnh của ${photo.exactDuplicateOf.matchCode ?? 'hồ sơ khác'}` : 'Không trùng chính xác ảnh nào' },
    { ok: !photo.nearDuplicateOf, text: photo.nearDuplicateOf ? `Gần trùng ảnh của ${photo.nearDuplicateOf.matchCode ?? 'hồ sơ khác'}` : 'Không gần trùng ảnh nào' },
    { ok: !photo.isScreenshot, text: photo.isScreenshot ? 'Ảnh chụp màn hình' : 'Không phải ảnh chụp màn hình' },
  ];
  return (
    <Modal open title={`Ảnh của ${owner}`} onClose={onClose}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-h-80 place-items-center overflow-hidden rounded-2xl bg-canvas">{url ? <img src={url} alt={`Ảnh bằng chứng của ${owner}`} className="max-h-[70vh] w-full object-contain" /> : <span className="text-sm text-ink-500">Đang mở ảnh…</span>}</div>
        <div className="grid content-start gap-4">
          <div className="flex items-center justify-between"><p className="font-bold">Mức của ảnh</p>{photo.level && <LevelBadge level={photo.level} />}</div>
          <div>
            <p className="text-sm font-semibold text-ink-700">AI đọc được</p>
            {sets.length === 0 ? <p className="text-sm text-ink-500">AI chưa đọc được ảnh này.</p> : (
              <table className="mt-1 w-full text-sm">
                <thead><tr className="text-xs text-ink-500"><th className="text-left">Set</th><th>Cột trái</th><th>Cột phải</th><th>Độ chắc</th></tr></thead>
                <tbody>{sets.map((set, index) => (
                  <tr key={index} className="text-figures border-t border-line text-center">
                    <td className="py-1 text-left">{set.index ?? index + 1}</td><td>{set.left}</td><td>{set.right}</td>
                    <td className={Math.min(set.confLeft, set.confRight) < 0.9 ? 'font-bold text-warning' : undefined}>{set.confLeft.toFixed(2)} / {set.confRight.toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
          <ul className="grid gap-2 text-sm">{signals.map((signal) => <li key={signal.text} className="flex gap-2"><span aria-hidden="true" className={signal.ok ? 'text-success' : 'text-warning'}>{signal.ok ? '✓' : '!'}</span>{signal.text}</li>)}</ul>
          {photo.ai && <details><summary className="cursor-pointer text-sm font-bold text-brand-navy">Chi tiết AI</summary><p className="mt-1 text-sm text-ink-500">{photo.ai.provider ?? '—'}, {photo.ai.model ?? '—'}{photo.ai.confidence !== null ? `, độ chắc thấp nhất ${photo.ai.confidence.toFixed(2)}` : ''}</p></details>}
          {url && <a href={url} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-navy">Mở ảnh gốc</a>}
        </div>
      </div>
    </Modal>
  );
}

export function PhotoCaseReview({ detail }: { detail: ReviewCaseDetail & PhotoCaseExtras }) {
  const [inspecting, setInspecting] = useState<{ photo: AdminPhotoView; owner: string } | null>(null);
  const people = detail.match.teams.flatMap((team) => team.players.map((player) => ({ ...player, side: team.side })));
  const nameOf = (userId: string) => people.find((person) => person.userId === userId)?.displayName ?? 'Người chơi';
  const ruling = [...detail.rulings].reverse().find((item) => item.tier === 2 || item.publishedAt) ?? null;
  const claims = detail.claimViews.filter((claim) => claim.purpose === 'claim');
  const evidence = detail.claimViews.filter((claim) => claim.purpose === 'evidence');
  const thumbs = (claim: AdminClaimView) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {claim.images.map((photo, index) => (
        <button key={photo.id} type="button" onClick={() => setInspecting({ photo, owner: nameOf(claim.claimantUserId) })}
          className="rounded-xl border border-line bg-canvas px-3 py-2 text-left text-xs hover:border-brand-navy">
          <span className="block font-bold">Ảnh {index + 1}{photo.level ? `, ${photo.level === 'green' ? 'Xanh' : photo.level === 'yellow' ? 'Vàng' : 'Đỏ'}` : ''}</span>
          <span className="text-ink-500">{photo.capturedAt ? `Chụp ${formatTimeVi(photo.capturedAt)}` : 'Không giờ chụp'}{photo.nearDuplicateOf || photo.exactDuplicateOf ? ', nghi trùng' : ''}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="surface-card p-5" aria-label="Người chơi và uy tín">
        <h3 className="text-h3">Người chơi và uy tín</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
              <span>{person.displayName}, Đội {person.side}</span>
              {detail.reputations[person.userId] && <Badge tone={REPUTATION_LABEL[detail.reputations[person.userId]!].tone}>{REPUTATION_LABEL[detail.reputations[person.userId]!].text}</Badge>}
            </li>
          ))}
        </ul>
      </section>

      {[...claims, ...evidence].map((claim) => (
        <section key={claim.id} className="surface-card p-5" aria-label={`Bản của ${nameOf(claim.claimantUserId)}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3">{claim.purpose === 'evidence' ? 'Bằng chứng tranh chấp' : 'Bản khai'} của {nameOf(claim.claimantUserId)}{claim.superseded ? ' (đã thay)' : ''}</h3>
            {claim.level && <LevelBadge level={claim.level} />}
          </div>
          <p className="mt-1 text-sm text-ink-500">{outcomeText(claim.outcome, claim.sets)}: {claim.sets.map((set) => `${set.teamA}–${set.teamB}`).join(', ')}. Gửi {shortTime(claim.createdAt)}{claim.manualEntry ? ', nhập tay' : ''}{claim.columnMappedBy === 'user' ? ', tự chọn cột' : ''}.</p>
          {claim.reasons.length > 0 && <p className="mt-2 text-sm">{claim.reasons.map((code) => ADMIN_REASON_TEXT[code] ?? code).join('. ')}.</p>}
          {thumbs(claim)}
        </section>
      ))}

      {ruling && (
        <section className="surface-card p-5" aria-label="Phán quyết tạm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-h3">{ruling.tier === 2 ? 'Phán quyết tạm của AI' : 'Kết quả tạm theo luật'}: {outcomeText(ruling.outcome)}</h3>
            {ruling.confidence !== null && <Badge>Tin cậy {ruling.confidence.toFixed(2)}</Badge>}
          </div>
          {!ruling.publishedAt && <p className="mt-1 text-sm text-warning">Chưa công bố (dưới ngưỡng tin cậy hoặc lỗi).</p>}
          <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm">{ruling.reasons.map((reason, index) => <li key={index}>{reason.text} <span className="text-xs text-ink-500">{reason.citations.join(', ')}</span></li>)}</ol>
          {ruling.adminNotes && <div className="mt-3 rounded-xl bg-warning-bg p-3 text-sm"><b>Ghi chú cho Admin</b> (người chơi không thấy): {ruling.adminNotes}</div>}
          <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-brand-navy">Chi tiết AI</summary><p className="mt-1 text-sm text-ink-500">{ruling.provider ?? '—'}, {ruling.model ?? '—'}{ruling.publishedAt ? `, công bố ${shortTime(ruling.publishedAt)}` : ''}</p></details>
        </section>
      )}

      {detail.appeals.length > 0 && (
        <section className="surface-card p-5" aria-label="Kháng nghị">
          <h3 className="text-h3">Kháng nghị</h3>
          <ul className="mt-2 grid gap-3">
            {detail.appeals.map((appeal) => (
              <li key={appeal.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold">{nameOf(appeal.userId)}, {shortTime(appeal.createdAt)} {appeal.accepted ? '' : '(bị từ chối vì thiếu căn cứ)'}</p>
                {appeal.pointedReason && <p className="mt-1 whitespace-pre-line"><b>Lý do bị chỉ ra:</b> {appeal.pointedReason}</p>}
                <p className="mt-1">“{appeal.reason}”</p>
                {appeal.evidenceIds.length > 0 && <p className="mt-1 text-ink-500">{appeal.evidenceIds.length} ảnh mới kèm theo</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <PhotoInspector matchId={detail.matchId} photo={inspecting?.photo ?? null} owner={inspecting?.owner ?? ''} onClose={() => setInspecting(null)} />
    </div>
  );
}
