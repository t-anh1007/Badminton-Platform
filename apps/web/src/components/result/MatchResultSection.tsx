import { useCallback, useEffect, useState } from 'react';
import { MatchResultFlow, useServerCountdown } from '../MatchResultFlow';
import { getResultCaseAny, isPhotoCase, type AnyResultCase } from '../../lib/resultApi';
import type { MatchOutcome, SetScore } from '../../lib/matchApi';
import { finalProposal } from './dispute/DisputeFrames';
import { useLiveDataRefresh } from '../../realtime/dataInvalidation.js';
import { Skeleton } from '../ui';
import { MatchResultPanel } from './MatchResultPanel';
import { nextDeadline } from './ResultProgressRail';
import { errorText } from './shared';

const RESULT_ANCHOR = 'ket-qua-tran';

/**
 * Khối "Kết quả trận" trên trang kèo: hồ sơ legacy (hoặc chưa mở) dùng luồng cũ không đổi; hồ sơ ra_v1 dùng luồng ảnh.
 */
export interface FinalScore { outcome: MatchOutcome; sets: SetScore[] | null }

export function MatchResultSection({ matchId, allowIncident = false, onFinalChange, onFinalScore }: {
  matchId: string; allowIncident?: boolean; onFinalChange?: (final: boolean) => void;
  /** Có thì trang đưa kết quả cuối lên thẻ Đội hình; khung kết quả cuối không lặp lại tỉ số. */
  onFinalScore?: (score: FinalScore | null) => void;
}) {
  const [resultCase, setResultCase] = useState<AnyResultCase | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    try {
      setResultCase(await getResultCaseAny(matchId));
      setLoadError('');
    } catch (cause) {
      // 404: hồ sơ chưa mở → luồng cũ lo phần báo sự cố trước/trong trận.
      if ((cause as { status?: number }).status === 404) setResultCase(null);
      else setLoadError(errorText(cause, 'Chưa tải được kết quả trận.'));
    }
  }, [matchId]);
  useEffect(() => { void load(); }, [load]);
  useLiveDataRefresh(load);
  const photo = resultCase && isPhotoCase(resultCase) ? resultCase : null;
  // Hết hạn: chỉ tải lại, backend tự quét hạn khi đọc hồ sơ (tech design §4.2).
  useServerCountdown(photo?.serverNow, photo ? nextDeadline(photo) : null, () => void load());
  const isFinal = photo?.status === 'final';
  useEffect(() => { if (photo) onFinalChange?.(isFinal); }, [photo, isFinal, onFinalChange]);
  useEffect(() => {
    if (!onFinalScore) return;
    if (!photo || photo.status !== 'final' || !photo.finalOutcome) { onFinalScore(null); return; }
    const { proposal, sameAsClaim } = finalProposal(photo);
    onFinalScore({ outcome: photo.finalOutcome, sets: sameAsClaim ? proposal.sets : null });
  }, [photo, onFinalScore]);
  // Link thông báo kết quả (#ket-qua-tran) cuộn tới khối này sau khi hồ sơ tải xong.
  const loaded = resultCase !== undefined;
  useEffect(() => {
    if (loaded && window.location.hash === `#${RESULT_ANCHOR}`) document.getElementById(RESULT_ANCHOR)?.scrollIntoView?.({ block: 'start' });
  }, [loaded]);

  if (loadError && !resultCase) {
    return (
      <section aria-label="Kết quả trận" className="surface-card p-6 text-center">
        <p className="text-h3">Chưa tải được kết quả trận</p>
        <p className="mt-1 text-sm text-ink-500">{loadError} Kết quả và hạn của bạn không bị ảnh hưởng.</p>
        <button type="button" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-5 text-sm font-bold uppercase text-brand-navy" onClick={() => void load()}>Thử lại</button>
      </section>
    );
  }
  if (resultCase === undefined) {
    return <section aria-label="Kết quả trận" aria-busy="true" className="surface-card space-y-4 p-6"><Skeleton className="h-7 w-1/3" /><Skeleton className="h-14 w-2/3" /><Skeleton className="h-4 w-1/2" /></section>;
  }
  return (
    <div id={RESULT_ANCHOR} className="scroll-mt-24">
      {photo ? <MatchResultPanel matchId={matchId} resultCase={photo} reload={load} scoreShownAbove={Boolean(onFinalScore)} /> : <MatchResultFlow matchId={matchId} allowIncident={allowIncident} onFinalChange={onFinalChange} />}
    </div>
  );
}
