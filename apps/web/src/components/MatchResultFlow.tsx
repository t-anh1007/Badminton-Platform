import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, SurfaceCard, TextArea, TextInput } from './ui';
import { ImageUploadPicker, type UploadImageState } from './CommunityComposer.js';
import { uploadAuthorizedFile } from '../lib/communityApi';
import {
  authorizeResultEvidence, confirmMatchResult, getResultCase, objectMatchResult, previewOutcome, readResultEvidence,
  reportMatchIncident, submitResultClaim, supplementResultEvidence,
  type EvidenceInput, type IncidentType, type MatchOutcome, type PlayerResultCase, type ResultCaseStatus, type SetScore,
} from '../lib/matchApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EXPIRED_REFETCH_MS = 30_000;
/** Nhãn nghiệp vụ duy nhất cho trạng thái hồ sơ; trang khác không lặp lại ánh xạ này. */
export const RESULT_STATUS_LABELS: Record<ResultCaseStatus, string> = {
  declaration_open: 'Chờ khai báo kết quả',
  provisional: 'Chờ phản hồi kết quả',
  incident_window: 'Chờ báo sự cố',
  provider_review: 'Chủ sân đang xem xét',
  admin_review: 'Admin đang quyết định',
  final: 'Kết quả đã chốt',
};
export const INCIDENTS: Array<{ value: IncidentType; title: string; description: string }> = [
  { value: 'no_show', title: 'Một bên không đến', description: 'Người chơi hoặc đội không có mặt để thi đấu. Chỉ khai báo từ 15 phút sau giờ bắt đầu.' },
  { value: 'not_played', title: 'Trận không diễn ra', description: 'Hai bên không thể bắt đầu trận theo kế hoạch.' },
  { value: 'interrupted', title: 'Trận bị gián đoạn', description: 'Trận đã bắt đầu nhưng không thể hoàn thành.' },
  { value: 'other', title: 'Vấn đề khác', description: 'Tình huống chưa có trong các lựa chọn trên.' },
];

/** Chỉ cho gửi khi mọi ảnh đã chọn đều tải xong; ảnh đang tải hoặc lỗi không được âm thầm bỏ qua. */
function evidenceReady(images: UploadImageState[]) {
  return images.length > 0 && images.every((image) => image.status === 'uploaded');
}

function evidenceOf(images: UploadImageState[]): EvidenceInput[] {
  return images.filter((image) => image.status === 'uploaded').map((image) => ({
    objectKey: image.objectKey!, mimeType: image.file.type as EvidenceInput['mimeType'], checksumSha256: image.checksumSha256,
  }));
}

export function useServerCountdown(serverNow: string | undefined, deadline: string | null, onExpire: () => void) {
  const offset = useRef(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (serverNow) offset.current = new Date(serverNow).getTime() - Date.now(); }, [serverNow]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = deadline ? Math.max(0, new Date(deadline).getTime() - (now + offset.current)) : null;
  const expired = remaining === 0;
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    // Hết giờ chỉ tải lại trạng thái từ server, không tự chốt ở client; scheduler có thể chậm tới vài phút
    // nên tiếp tục hỏi lại mỗi 30 giây cho tới khi server trả hạn mới.
    if (!expired) return;
    onExpireRef.current();
    const timer = window.setInterval(() => onExpireRef.current(), EXPIRED_REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [expired, deadline]);
  if (remaining === null) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  const days = Math.floor(remaining / 86_400_000);
  return `${days > 0 ? `${days} ngày ` : ''}${pad(Math.floor((remaining % 86_400_000) / 3_600_000))}:${pad(Math.floor((remaining % 3_600_000) / 60_000))}:${pad(Math.floor((remaining % 60_000) / 1_000))}`;
}

function outcomeLabel(outcome: MatchOutcome, resultCase: PlayerResultCase) {
  if (outcome === 'NO_RESULT') return 'Không có kết quả';
  const side = outcome === 'TEAM_A_WIN' ? 'A' : 'B';
  const names = resultCase.match.teams.find((team) => team.side === side)?.players.map((player) => player.displayName).join(' & ');
  return `${names ?? `Đội ${side}`} thắng`;
}

function Row({ label, value, hint, badge }: { label: string; value: string; hint?: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <div><p className="text-sm text-ink-900">{label}</p>{hint && <p className="text-xs text-ink-500">{hint}</p>}</div>
      <div className="text-right"><p className="text-figures font-bold text-brand-navy">{value}</p>{badge}</div>
    </div>
  );
}

export function EvidenceThumbs({ matchId, evidence }: { matchId: string; evidence: Array<{ id: string }> }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const open = async (id: string) => {
    try {
      const { url } = await readResultEvidence(matchId, id);
      setUrls((current) => ({ ...current, [id]: url }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể mở ảnh.'); }
  };
  return (
    <div>
      <div className="mt-2 flex flex-wrap gap-2">
        {evidence.map((item, index) => urls[item.id]
          ? <img key={item.id} src={urls[item.id]} alt={`Ảnh minh chứng ${index + 1}`} className="h-28 w-40 rounded-xl border border-line object-cover" />
          : <Button key={item.id} size="sm" tone="secondary" onClick={() => void open(item.id)}>{`Xem ảnh ${index + 1}`}</Button>)}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-2 text-xs text-ink-500">Chỉ người trong kèo và bên xử lý khiếu nại được xem ảnh.</p>
    </div>
  );
}

/** Màn 05: khai báo sự cố; dùng được cả khi hồ sơ kết quả chưa mở (sự cố trước/trong trận). */
export function IncidentForm({ matchId, onDone }: { matchId: string; onDone: () => void | Promise<void> }) {
  const [incidentType, setIncidentType] = useState<IncidentType>('not_played');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<UploadImageState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await reportMatchIncident(matchId, { type: incidentType, description: description.trim(), evidence: evidenceOf(images) });
      setSent(true);
      await onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể gửi báo sự cố.'); }
    finally { setBusy(false); }
  };
  if (sent) return <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">Đã gửi báo sự cố. Hồ sơ chuyển sang bước xem xét.</p>;
  return (
    <SurfaceCard>
      <h3 className="text-h3">Trận đấu gặp vấn đề gì?</h3>
      <p className="text-sm text-ink-500">Khai báo sự cố không tự xác định bên thắng hoặc chia tiền kèo.</p>
      <fieldset className="mt-3 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Loại sự cố</legend>
        {INCIDENTS.map((option) => (
          <label key={option.value} className={`block cursor-pointer rounded-2xl border-2 p-3 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-green-100 ${incidentType === option.value ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
            <input type="radio" name="incident-type" className="sr-only" checked={incidentType === option.value} onChange={() => setIncidentType(option.value)} />
            <span className="block font-semibold text-brand-navy">{option.title}</span>
            <span className="mt-1 block text-xs text-ink-500">{option.description}</span>
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block text-sm font-bold">Mô tả sự việc<TextArea className="mt-1" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <div className="mt-3">
        <ImageUploadPicker label="Thêm ảnh minh chứng" maxFiles={3} maxBytes={EVIDENCE_MAX_BYTES}
          authorize={(mimeType, metadata) => authorizeResultEvidence(matchId, mimeType, metadata)} upload={uploadAuthorizedFile} onUploadedChange={setImages} />
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <Button className="mt-4" disabled={busy || !description.trim() || !evidenceReady(images)} onClick={() => void submit()}>Gửi báo sự cố</Button>
    </SurfaceCard>
  );
}

/** Màn 03-05 gắn trong trang kèo: mọi quyền thao tác lấy từ viewerActions của server. */
export function MatchResultFlow({ matchId, allowIncident = false }: { matchId: string; allowIncident?: boolean }) {
  const [resultCase, setResultCase] = useState<PlayerResultCase | null | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState<SetScore[]>([]);
  const [claimImages, setClaimImages] = useState<UploadImageState[]>([]);
  const [response, setResponse] = useState<'confirm' | 'object'>('confirm');
  const [reason, setReason] = useState('');
  const [objectionImages, setObjectionImages] = useState<UploadImageState[]>([]);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [supplementImages, setSupplementImages] = useState<UploadImageState[]>([]);
  const [counterClaimOpen, setCounterClaimOpen] = useState(false);
  const [pickerVersion, setPickerVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const next = await getResultCase(matchId);
      setResultCase(next);
      setSets((current) => current.length ? current : Array.from({ length: next.match.format === 'bo5' ? 5 : 3 }, () => ({ teamA: 0, teamB: 0 })));
    } catch {
      setResultCase(null);
    }
  }, [matchId]);
  useEffect(() => { void load(); }, [load]);
  // Người khác khai/phản hồi: thông báo realtime làm mới hồ sơ mà không remount trang.
  useLiveDataRefresh(load);

  const deadline = resultCase?.status === 'declaration_open' ? resultCase.declarationDeadlineAt
    : resultCase?.status === 'provisional' ? resultCase.teamGraceDeadlineAt ?? resultCase.objectionDeadlineAt : null;
  const countdown = useServerCountdown(resultCase?.serverNow, deadline ?? null, () => void load());
  if (resultCase === null && allowIncident) {
    return incidentOpen
      ? <IncidentForm matchId={matchId} onDone={load} />
      : <Button tone="secondary" onClick={() => setIncidentOpen(true)}>Báo sự cố trận đấu</Button>;
  }
  if (!resultCase) return null;

  const authorize = (mimeType: EvidenceInput['mimeType'], metadata?: { size: number; checksumSha256: string }) =>
    authorizeResultEvidence(matchId, mimeType, metadata);
  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await operation();
      setNotice(success);
      setPickerVersion((value) => value + 1);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể gửi.'); }
    finally { setBusy(false); }
  };
  const playedSets = sets.filter((set) => set.teamA > 0 || set.teamB > 0);
  const inferred = previewOutcome(resultCase.match.format, playedSets);
  const teamName = (side: 'A' | 'B') => resultCase.match.teams.find((team) => team.side === side)?.players.map((player) => player.displayName).join(' & ') ?? `Đội ${side}`;
  const claimEvidence = evidenceOf(claimImages);
  const { viewerActions: actions, viewerMoney: money } = resultCase;

  return (
    <section aria-label="Kết quả trận" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h2">Kết quả trận</h2>
        <Badge tone={resultCase.status === 'final' ? 'success' : 'warning'}>{RESULT_STATUS_LABELS[resultCase.status]}</Badge>
      </div>
      <div className="surface-card grid gap-3 p-4 text-sm sm:grid-cols-3">
        <div><p className="text-xs text-ink-500">Sân và địa chỉ</p><p className="font-semibold">{resultCase.match.venue.name} - {resultCase.match.court.name}</p><p>{resultCase.match.venue.address}</p></div>
        <div><p className="text-xs text-ink-500">Thời gian thi đấu</p><p className="font-semibold">{formatDateTimeVi(resultCase.match.startAt)}</p><p>{resultCase.match.format === 'bo5' ? 'BO5' : 'BO3'} - 21 điểm - giới hạn 30</p></div>
        <div><p className="text-xs text-ink-500">Kèo</p><p className="font-semibold">{resultCase.match.mode === 'ranked' ? 'Xếp hạng' : 'Giao lưu'} - {resultCase.match.discipline === 'doubles' ? 'Đánh đôi' : 'Đánh đơn'}</p><p>Tỷ lệ thua : thắng = {resultCase.match.ratio.replace(':', ' : ')}</p></div>
      </div>
      {countdown && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] bg-brand-navy p-5 text-surface">
          <div>
            <p className="text-lg font-bold">{resultCase.status === 'declaration_open' ? 'Thời hạn khai báo kết quả' : 'Thời hạn phản hồi kết quả'}</p>
            <p className="text-sm opacity-90">Hết hạn {formatDateTimeVi(deadline!)}. Hệ thống xử lý theo trạng thái trên máy chủ.</p>
          </div>
          <p className="text-figures text-3xl font-bold text-brand-yellow">{countdown}</p>
        </div>
      )}
      {notice && <p role="status" className="rounded-xl bg-success-bg p-3 text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          {resultCase.finalOutcome && (
            <SurfaceCard><h3 className="text-h3">Kết quả chính thức</h3><p className="mt-2 text-lg font-bold text-brand-navy">{outcomeLabel(resultCase.finalOutcome, resultCase)}</p></SurfaceCard>
          )}
          {resultCase.provisional && (
            <SurfaceCard>
              <h3 className="text-h3">Kết quả {resultCase.provisional.claimant.displayName} đã khai báo</h3>
              <table className="mt-3 w-full text-sm">
                <thead><tr className="text-left text-xs text-ink-500"><th className="py-2">Set</th><th>{teamName('A')}</th><th>{teamName('B')}</th></tr></thead>
                <tbody>{resultCase.provisional.sets.map((set, index) => (
                  <tr key={index} className="border-t border-line"><td className="py-2">Set {index + 1}</td><td className="text-figures">{set.teamA}</td><td className="text-figures">{set.teamB}</td></tr>
                ))}</tbody>
              </table>
              <p className="mt-3 rounded-xl bg-success-bg p-3 font-semibold text-success">{outcomeLabel(resultCase.provisional.outcome, resultCase)}</p>
              <h4 className="mt-4 text-sm font-bold">Ảnh minh chứng</h4>
              <EvidenceThumbs matchId={matchId} evidence={resultCase.provisional.evidence} />
            </SurfaceCard>
          )}
          {actions.canClaim && resultCase.provisional && !counterClaimOpen && (
            // Đã có kết quả tạm: ưu tiên phản hồi; khai bản khác vẫn được phép theo quy tắc nhưng không mở sẵn.
            <Button tone="secondary" onClick={() => setCounterClaimOpen(true)}>Tôi có tỷ số khác - khai báo</Button>
          )}
          {actions.canClaim && (!resultCase.provisional || counterClaimOpen) && (
            <SurfaceCard>
              <h3 className="text-h3">Nhập tỷ số chính thức</h3>
              <p className="text-sm text-ink-500">Chỉ nhập các set đã đánh; set cuối có thể chưa xong nếu hết giờ sân.</p>
              <table className="mt-3 w-full text-sm">
                <thead><tr className="text-left text-xs text-ink-500"><th className="py-2">Set</th><th>{teamName('A')}</th><th>{teamName('B')}</th></tr></thead>
                <tbody>{sets.map((set, index) => (
                  <tr key={index} className="border-t border-line">
                    <td className="py-2">Set {index + 1}</td>
                    {(['teamA', 'teamB'] as const).map((key) => (
                      <td key={key} className="pr-3">
                        <TextInput aria-label={`Set ${index + 1} ${key === 'teamA' ? teamName('A') : teamName('B')}`} inputMode="numeric" className="w-20 text-center"
                          value={set[key] ? String(set[key]) : ''}
                          onChange={(event) => setSets(sets.map((item, position) => position === index ? { ...item, [key]: Number(event.target.value.replace(/\D/g, '').slice(0, 2)) } : item))} />
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
              <p className="mt-3 rounded-xl bg-canvas p-3 text-sm" aria-live="polite">
                {inferred === null ? 'Tỷ số chưa hợp lệ theo luật 21 điểm, cách 2 điểm, tối đa 30.'
                  : inferred.outcome === 'NO_RESULT' ? 'Tỷ số chưa xác định bên thắng; hãy báo sự cố thay vì khai kết quả.'
                    : `Hệ thống xác định từ tỷ số đã nhập: ${outcomeLabel(inferred.outcome, resultCase)} ${Math.max(inferred.setWinsA, inferred.setWinsB)}-${Math.min(inferred.setWinsA, inferred.setWinsB)}`}
              </p>
              <h4 className="mt-4 text-sm font-bold">Ảnh minh chứng (bắt buộc 1-3 ảnh, tối đa 5 MB mỗi ảnh)</h4>
              <div className="mt-2"><ImageUploadPicker key={`claim-${pickerVersion}`} label="Thêm ảnh bảng điểm hoặc ảnh tại sân" maxFiles={3} maxBytes={EVIDENCE_MAX_BYTES} authorize={authorize} upload={uploadAuthorizedFile} onUploadedChange={setClaimImages} /></div>
              <Button className="mt-4" disabled={busy || !inferred || inferred.outcome === 'NO_RESULT' || !evidenceReady(claimImages)}
                onClick={() => void run(() => submitResultClaim(matchId, { sets: playedSets, evidence: claimEvidence }), 'Đã gửi kết quả. Đối thủ có 12 giờ để đồng ý hoặc khiếu nại.')}>
                Gửi kết quả
              </Button>
            </SurfaceCard>
          )}
          {incidentOpen && actions.canReportIncident && <IncidentForm matchId={matchId} onDone={load} />}
        </div>
        <aside className="space-y-5">
          {(actions.canConfirm || actions.canObject) && (
            <SurfaceCard>
              <h3 className="text-h3">Phản hồi của bạn</h3>
              <fieldset className="mt-3 space-y-3">
                <legend className="sr-only">Chọn phản hồi</legend>
                {actions.canConfirm && (
                  <label className={`block cursor-pointer rounded-2xl border-2 p-3 ${response === 'confirm' ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
                    <input type="radio" name="result-response" className="mr-2" checked={response === 'confirm'} onChange={() => setResponse('confirm')} />
                    <span className="font-semibold text-brand-navy">Tôi đồng ý với kết quả</span>
                    <span className="mt-1 block text-xs text-ink-500">Xác nhận tỷ số và người thắng đã khai báo đúng.</span>
                  </label>
                )}
                {actions.canObject && (
                  <label className={`block cursor-pointer rounded-2xl border-2 p-3 ${response === 'object' ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
                    <input type="radio" name="result-response" className="mr-2" checked={response === 'object'} onChange={() => setResponse('object')} />
                    <span className="font-semibold text-danger">Tôi muốn khiếu nại</span>
                    <span className="mt-1 block text-xs text-ink-500">Nhập lý do và tải 1-3 ảnh minh chứng.</span>
                  </label>
                )}
              </fieldset>
              {response === 'object' && actions.canObject && (
                <div className="mt-3 space-y-3">
                  <label className="block text-sm font-bold">Lý do khiếu nại<TextArea className="mt-1" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
                  <ImageUploadPicker key={`object-${pickerVersion}`} label="Thêm ảnh minh chứng" maxFiles={3} maxBytes={EVIDENCE_MAX_BYTES} authorize={authorize} upload={uploadAuthorizedFile} onUploadedChange={setObjectionImages} />
                </div>
              )}
              <Button className="mt-4 w-full" disabled={busy || (response === 'object' && (!reason.trim() || !evidenceReady(objectionImages)))}
                onClick={() => void run(
                  () => (response === 'confirm' && actions.canConfirm ? confirmMatchResult(matchId) : objectMatchResult(matchId, { reason: reason.trim(), evidence: evidenceOf(objectionImages) })),
                  response === 'confirm' ? 'Đã xác nhận kết quả.' : 'Đã gửi khiếu nại. Hồ sơ chuyển sang bước xem xét.',
                )}>
                Gửi phản hồi
              </Button>
            </SurfaceCard>
          )}
          {money && (
            <SurfaceCard>
              <h3 className="text-h3">Tiền của bạn</h3>
              <Row label="Tiền đang giữ chờ kết quả" value={formatMoneyVnd(money.heldForResult)} />
              <Row label="Nếu kết quả được công nhận" hint="Khoản nhận thêm vào số dư" value={formatMoneyVnd(money.projectedReceivable)}
                badge={money.withdrawableIfFinal ? <Badge tone="success">Có thể rút</Badge> : undefined} />
              <Row label="Chi phí cuối của bạn" value={formatMoneyVnd(money.projectedFinalCost)} />
              <p className="mt-3 rounded-xl bg-canvas p-3 text-xs text-ink-600">Tiền vẫn được giữ và điểm xếp hạng chưa thay đổi cho đến khi kết quả có hiệu lực.</p>
            </SurfaceCard>
          )}
          {['provisional', 'incident_window', 'provider_review', 'admin_review'].includes(resultCase.status) && (
            <SurfaceCard>
              <h3 className="text-h3">Bổ sung bằng chứng</h3>
              <p className="mt-1 text-sm text-ink-500">Thêm ảnh cho người xem xét. Mỗi người tối đa 5 ảnh cho một hồ sơ.</p>
              <div className="mt-3"><ImageUploadPicker key={`supplement-${pickerVersion}`} label="Thêm ảnh bổ sung" maxFiles={3} maxBytes={EVIDENCE_MAX_BYTES} authorize={authorize} upload={uploadAuthorizedFile} onUploadedChange={setSupplementImages} /></div>
              <Button tone="secondary" className="mt-3 w-full" disabled={busy || !evidenceReady(supplementImages)}
                onClick={() => void run(() => supplementResultEvidence(matchId, evidenceOf(supplementImages)), 'Đã bổ sung bằng chứng.')}>
                Gửi ảnh bổ sung
              </Button>
            </SurfaceCard>
          )}
          {actions.canReportIncident && !incidentOpen && (
            <Button tone="secondary" className="w-full" onClick={() => setIncidentOpen(true)}>Báo sự cố trận đấu</Button>
          )}
        </aside>
      </div>
    </section>
  );
}
