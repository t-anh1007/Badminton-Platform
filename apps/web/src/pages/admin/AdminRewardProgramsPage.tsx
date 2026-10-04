import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VIETNAM_PROVINCES } from '@khoaluantn/shared';
import { AsyncButton, Badge, Button, Modal, Pagination, SelectInput, SurfaceCard, TextArea, TextInput } from '../../components/ui';
import { formatDateVi, formatMoneyVnd } from '../../lib/formatters.js';
import { listAdminSeasons, type AdminSeason } from '../../lib/competitionApi';
import {
  approveRewardProgramFinal, cancelRewardProgram, createRewardProgram, getAdminRewardProgram, listAdminRewardPrograms, publishRewardProgram,
  REWARD_STATUS_LABELS, type AdminRewardProgram, type NewRewardProgram, type RewardProgram,
} from '../../lib/rewardApi';

const CRITERIA: Array<{ value: RewardProgram['criterion']; title: string; description: string }> = [
  { value: 'ending_rating', title: 'Top điểm xếp hạng', description: 'Điểm cao nhất khi chương trình kết thúc.' },
  { value: 'most_wins', title: 'Nhiều trận thắng nhất', description: 'Tổng số trận thắng hợp lệ trong thời gian chương trình.' },
  { value: 'largest_rating_gain', title: 'Tăng điểm nhiều nhất', description: 'Mức tăng điểm lớn nhất trong thời gian chương trình.' },
  { value: 'longest_streak', title: 'Chuỗi thắng dài nhất', description: 'Số trận thắng liên tiếp dài nhất.' },
];
const province = (code: string | null | undefined) => VIETNAM_PROVINCES.find((item) => item.code === code)?.name ?? '';
const dayStart = (date: string) => new Date(`${date}T00:00:00+07:00`);
/** Mốc thời gian → YYYY-MM-DD theo giờ Việt Nam cho ô nhập ngày. */
const inputDate = (at: string | number) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const digits = (value: string) => value.replace(/\D/g, '').replace(/^0+/, '');
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

/** Màn 12: tạo và công bố chương trình thưởng; sau công bố tiền thưởng và phạm vi bị khóa. */
export function AdminRewardProgramsPage() {
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [listVersion, setListVersion] = useState(0);
  useEffect(() => { listAdminSeasons(1, 50).then((result) => setSeasons(result.items.filter((season) => season.status !== 'closed')), () => setSeasons([])); }, []);
  return (
    <>
      <h2 className="text-h1">Chương trình thưởng</h2>
      <p className="mt-2 text-ink-500">Chọn một hạng mục, phạm vi và cơ cấu giải thưởng muốn công bố.</p>
      <ProgramForm seasons={seasons} onPublished={() => setListVersion((value) => value + 1)} />
      <ProgramList key={listVersion} />
    </>
  );
}

interface Draft { name: string; seasonId: string; criterion: RewardProgram['criterion']; discipline: NewRewardProgram['discipline']; band: NewRewardProgram['band']; scope: NewRewardProgram['scope']; provinceCode: string; start: string; end: string; tiers: string[] }
const EMPTY: Draft = { name: '', seasonId: '', criterion: 'ending_rating', discipline: 'singles', band: 'under_1600', scope: 'global', provinceCode: '', start: '', end: '', tiers: [''] };

function ProgramForm({ seasons, onPublished }: { seasons: AdminSeason[]; onPublished: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
  const season = seasons.find((item) => item.id === draft.seasonId);
  // Chọn kỳ thì điền sẵn ngày theo kỳ; chỉ công bố được chương trình chưa bắt đầu nên kỳ đang chạy lấy từ ngày mai.
  const pickSeason = (seasonId: string) => {
    const picked = seasons.find((item) => item.id === seasonId);
    if (!picked) { set('seasonId', seasonId); return; }
    const tomorrow = inputDate(Date.now() + 86_400_000);
    const seasonStart = inputDate(picked.startAt);
    setDraft((prev) => ({ ...prev, seasonId, start: seasonStart > tomorrow ? seasonStart : tomorrow, end: inputDate(new Date(picked.endAt).getTime() - 1) }));
  };
  const total = draft.tiers.reduce((sum, amount) => sum + BigInt(digits(amount) || '0'), 0n);

  const validate = () => {
    if (!draft.name.trim()) return 'Nhập tên chương trình.';
    if (!season) return 'Chọn kỳ xếp hạng.';
    if (!draft.start || !draft.end || draft.end < draft.start) return 'Chọn ngày bắt đầu và ngày kết thúc hợp lệ.';
    const endAt = dayStart(draft.end).getTime() + 86_400_000;
    if (dayStart(draft.start) < new Date(season.startAt) || endAt > new Date(season.endAt).getTime()) return 'Ngày bắt đầu và kết thúc phải nằm trong kỳ xếp hạng đã chọn.';
    if (draft.scope === 'province' && !draft.provinceCode) return 'Chọn tỉnh/thành cho phạm vi.';
    if (draft.tiers.some((amount) => !digits(amount))) return 'Nhập số tiền cho mọi mức giải.';
    return '';
  };
  const review = () => { const message = validate(); setError(message); if (!message) setConfirming(true); };
  const publish = async () => {
    setPending(true);
    setError('');
    try {
      const endAt = dayStart(draft.end);
      endAt.setUTCDate(endAt.getUTCDate() + 1);
      const { program } = await createRewardProgram({
        name: draft.name.trim(), seasonId: draft.seasonId, criterion: draft.criterion, discipline: draft.discipline, band: draft.band,
        scope: draft.scope, ...(draft.scope === 'province' ? { provinceCode: draft.provinceCode } : {}),
        startAt: dayStart(draft.start).toISOString(), endAt: endAt.toISOString(),
        tiers: draft.tiers.map((amount, index) => ({ rank: index + 1, amount: digits(amount) })),
      });
      await publishRewardProgram(program.id);
      setConfirming(false);
      setDraft(EMPTY);
      setNotice(`Đã công bố ${program.name}.`);
      onPublished();
    } catch (cause) { setError(errorText(cause, 'Không thể công bố chương trình.')); setConfirming(false); } finally { setPending(false); }
  };
  const criterion = CRITERIA.find((item) => item.value === draft.criterion)!;
  const scopeText = `${draft.discipline === 'singles' ? 'Đánh đơn' : 'Đánh đôi'} - ${draft.band === 'under_1600' ? 'Dưới 1.600' : 'Từ 1.600'} - ${draft.scope === 'province' ? province(draft.provinceCode) || 'Chưa chọn tỉnh/thành' : 'Toàn nền tảng'}`;

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SurfaceCard>
        <h3 className="text-h3">1. Thông tin cơ bản</h3>
        <label className="mt-3 block text-sm font-bold">Tên chương trình<TextInput className="mt-1" value={draft.name} onChange={(event) => set('name', event.target.value)} /></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-bold">Kỳ xếp hạng
            <SelectInput className="mt-1" value={draft.seasonId} onChange={(event) => pickSeason(event.target.value)}>
              <option value="">Chọn kỳ</option>
              {seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </SelectInput>
          </label>
          <label className="block text-sm font-bold">Ngày bắt đầu<TextInput className="mt-1" type="date" value={draft.start} onChange={(event) => set('start', event.target.value)} /></label>
          <label className="block text-sm font-bold">Ngày kết thúc<TextInput className="mt-1" type="date" value={draft.end} onChange={(event) => set('end', event.target.value)} /></label>
        </div>
        <h3 className="mt-6 border-t border-line pt-5 text-h3">2. Hạng mục được thưởng</h3>
        <p className="text-sm text-ink-500">Mỗi chương trình chỉ chọn một cách xác định thành tích.</p>
        <fieldset className="mt-3 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Hạng mục</legend>
          {CRITERIA.map((item) => (
            <label key={item.value} className={`block cursor-pointer rounded-2xl border-2 p-3 ${draft.criterion === item.value ? 'border-brand-navy bg-canvas' : 'border-line'}`}>
              <input type="radio" name="criterion" className="mr-2" checked={draft.criterion === item.value} onChange={() => set('criterion', item.value)} />
              <span className="font-semibold text-brand-navy">{item.title}</span>
              <span className="mt-1 block text-xs text-ink-500">{item.description}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-bold">Nội dung thi đấu
            <SelectInput className="mt-1" value={draft.discipline} onChange={(event) => set('discipline', event.target.value as Draft['discipline'])}>
              <option value="singles">Đánh đơn</option><option value="doubles">Đánh đôi</option>
            </SelectInput>
          </label>
          <label className="block text-sm font-bold">Nhóm điểm
            <SelectInput className="mt-1" value={draft.band} onChange={(event) => set('band', event.target.value as Draft['band'])}>
              <option value="under_1600">Dưới 1.600</option><option value="from_1600">Từ 1.600</option>
            </SelectInput>
          </label>
          <label className="block text-sm font-bold">Phạm vi
            <SelectInput className="mt-1" value={draft.scope} onChange={(event) => set('scope', event.target.value as Draft['scope'])}>
              <option value="global">Toàn nền tảng</option><option value="province">Tỉnh/thành</option>
            </SelectInput>
          </label>
        </div>
        {draft.scope === 'province' && (
          <label className="mt-3 block text-sm font-bold">Tỉnh/thành
            <SelectInput className="mt-1" value={draft.provinceCode} onChange={(event) => set('provinceCode', event.target.value)}>
              <option value="">Chọn tỉnh/thành</option>
              {VIETNAM_PROVINCES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </SelectInput>
          </label>
        )}
        <h3 className="mt-6 border-t border-line pt-5 text-h3">3. Cơ cấu giải thưởng</h3>
        <p className="text-sm text-ink-500">Có thể cấu hình nhiều vị trí nhận thưởng.</p>
        <ul className="mt-3 space-y-2">
          {draft.tiers.map((amount, index) => (
            <li key={index} className="flex items-center gap-3">
              <label className="flex flex-1 items-center gap-3 text-sm font-bold" htmlFor={`tier-${index}`}>
                <span className="w-14 shrink-0">Top {index + 1}</span>
                <TextInput id={`tier-${index}`} inputMode="numeric" value={amount ? Number(digits(amount)).toLocaleString('vi-VN') : ''}
                  onChange={(event) => set('tiers', draft.tiers.map((item, position) => (position === index ? digits(event.target.value) : item)))} />
              </label>
              <Button size="sm" tone="ghost" aria-label={`Xóa mức giải Top ${index + 1}`} disabled={draft.tiers.length === 1}
                onClick={() => set('tiers', draft.tiers.filter((_, position) => position !== index))}>×</Button>
            </li>
          ))}
        </ul>
        <Button size="sm" tone="secondary" className="mt-3" disabled={draft.tiers.length >= 50} onClick={() => set('tiers', [...draft.tiers, ''])}>+ Thêm mức giải</Button>
      </SurfaceCard>
      <SurfaceCard className="h-fit">
        <h3 className="text-h3">Kiểm tra trước khi công bố</h3>
        <p className="mt-1 text-sm text-ink-500">Thông tin này sẽ hiển thị công khai cho người chơi.</p>
        <dl className="mt-3 divide-y divide-line text-sm">
          <div className="flex justify-between gap-3 py-2"><dt>Hạng mục</dt><dd className="text-right font-semibold">{criterion.title}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt className="shrink-0">Áp dụng</dt><dd className="text-right font-semibold">{scopeText}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Thời gian</dt><dd className="text-right font-semibold">{draft.start && draft.end ? `${formatDateVi(dayStart(draft.start))} - ${formatDateVi(dayStart(draft.end))}` : '—'}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Số mức giải</dt><dd className="font-semibold">{draft.tiers.length}</dd></div>
          <div className="flex justify-between gap-3 py-2"><dt>Tổng tiền thưởng</dt><dd className="text-figures font-bold">{formatMoneyVnd(total.toString())}</dd></div>
        </dl>
        <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">Ngày bắt đầu và kết thúc phải nằm trong kỳ xếp hạng đã chọn.</p>
        <p className="mt-2 rounded-xl bg-canvas p-3 text-xs text-ink-700">Sau khi công bố: không được giảm tiền thưởng, đổi hạng mục hoặc rút ngắn thời gian. Chỉ có thể hủy do sự cố trước ngày bắt đầu hoặc khi đang chạy kèm lý do.</p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm text-success">{notice}</p>}
        <Button className="mt-3 w-full" onClick={review}>Kiểm tra và công bố</Button>
      </SurfaceCard>
      <Modal open={confirming} title="Công bố chương trình thưởng" onClose={() => setConfirming(false)}>
        <p className="text-sm">Công bố <strong>{draft.name.trim()}</strong> với tổng thưởng <strong>{formatMoneyVnd(total.toString())}</strong>. Sau khi công bố, tiền thưởng và phạm vi bị khóa.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button tone="secondary" onClick={() => setConfirming(false)}>Quay lại</Button>
          <AsyncButton pending={pending} onClick={() => void publish()}>Công bố</AsyncButton>
        </div>
      </Modal>
    </div>
  );
}

function ProgramList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminRewardProgram[]; total: number; pageSize: number } | null>(null);
  const [message, setMessage] = useState('');
  const [cancelling, setCancelling] = useState<AdminRewardProgram | null>(null);
  const [reviewing, setReviewing] = useState<AdminRewardProgram | null>(null);
  const load = useCallback(() => { listAdminRewardPrograms(page).then(setData, (cause) => setMessage(errorText(cause, 'Không thể tải chương trình.'))); }, [page]);
  useEffect(load, [load]);
  const act = async (operation: () => Promise<unknown>, success: string) => {
    try { await operation(); setMessage(success); setCancelling(null); setReviewing(null); load(); } catch (cause) { setMessage(errorText(cause, 'Không thể xử lý.')); }
  };
  return (
    <SurfaceCard className="mt-5">
      <h3 className="text-h3">Chương trình đã tạo</h3>
      {message && <p role="status" className="mt-3 rounded-xl bg-info-bg p-3 text-sm">{message}</p>}
      {!data ? <p className="mt-3 text-sm text-ink-500">Đang tải…</p> : data.items.length === 0 ? <p className="mt-3 text-sm text-ink-500">Chưa có chương trình nào.</p> : (
        <ul className="mt-3 divide-y divide-line">
          {data.items.map((program) => (
            <li key={program.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-brand-navy">{program.name}</p>
                <p className="text-xs text-ink-500">{program.criterionLabel} - {formatDateVi(program.startAt)} - {formatDateVi(new Date(new Date(program.endAt).getTime() - 1))}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge tone={program.status === 'cancelled' ? 'danger' : program.status === 'final' ? 'success' : 'neutral'}>{REWARD_STATUS_LABELS[program.status as keyof typeof REWARD_STATUS_LABELS] ?? 'Bản nháp'}</Badge>
                {(program.status as string) === 'draft' && <Button size="sm" onClick={() => void act(() => publishRewardProgram(program.id), `Đã công bố ${program.name}.`)}>Công bố</Button>}
                {['scheduled', 'active'].includes(program.status) && <Button size="sm" tone="danger" onClick={() => setCancelling(program)}>Hủy chương trình</Button>}
                {program.status === 'awaiting_admin_approval' && (
                  <Button size="sm" onClick={() => void getAdminRewardProgram(program.id).then((result) => setReviewing(result.program), (cause) => setMessage(errorText(cause, 'Không thể tải danh sách.')))}>Duyệt kết quả</Button>
                )}
                {program.status === 'final' && <Link className="text-sm font-bold text-brand-navy underline" to={`/admin/reward-payouts?programId=${program.id}`}>Danh sách nhận giải</Link>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && data.total > data.pageSize && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} /></div>}
      {cancelling && <CancelDialog program={cancelling} onClose={() => setCancelling(null)} onConfirm={(reason) => act(() => cancelRewardProgram(cancelling.id, reason), `Đã hủy ${cancelling.name}.`)} />}
      <Modal open={reviewing !== null} title="Duyệt danh sách nhận giải" onClose={() => setReviewing(null)}>
        {reviewing && (
          <>
            <p className="text-sm text-ink-500">Danh sách do hệ thống tính. Quản trị viên chỉ duyệt, không sửa điểm, thứ hạng hay người nhận.</p>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-500"><th className="py-2">Hạng</th><th>Người nhận</th><th className="text-right">Thành tích</th><th className="text-right">Tiền thưởng</th></tr></thead>
              <tbody>
                {(reviewing.awards ?? []).map((award) => (
                  <tr key={award.userId} className="border-b border-line last:border-0">
                    <td className="py-2 font-bold">{award.rank}</td><td>{award.displayName}</td>
                    <td className="text-figures text-right">{award.score.toLocaleString('vi-VN')}</td><td className="text-figures text-right">{formatMoneyVnd(award.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right text-sm">Tổng: <strong className="text-figures">{formatMoneyVnd(reviewing.awardTotal ?? '0')}</strong></p>
            <div className="mt-5 flex justify-end gap-2">
              <Button tone="secondary" onClick={() => setReviewing(null)}>Đóng</Button>
              <Button onClick={() => void act(() => approveRewardProgramFinal(reviewing.id), `Đã duyệt kết quả ${reviewing.name}.`)}>Duyệt và thông báo người nhận</Button>
            </div>
          </>
        )}
      </Modal>
    </SurfaceCard>
  );
}

function CancelDialog({ program, onClose, onConfirm }: { program: AdminRewardProgram; onClose: () => void; onConfirm: (reason?: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  // Chương trình đang chạy chỉ được hủy kèm lý do sự cố.
  const running = program.status === 'active' || new Date(program.startAt) <= new Date();
  return (
    <Modal open title="Hủy chương trình thưởng" onClose={onClose}>
      <p className="text-sm">Hủy <strong>{program.name}</strong>. Người chơi sẽ được thông báo và không có giải nào được trao.</p>
      <label className="mt-3 block text-sm font-bold">Lý do hủy{running ? '' : ' (không bắt buộc)'}
        <TextArea className="mt-1" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button tone="secondary" onClick={onClose}>Quay lại</Button>
        <AsyncButton tone="danger" pending={pending} disabled={running && !reason.trim()} onClick={() => { setPending(true); void onConfirm(reason.trim() || undefined).finally(() => setPending(false)); }}>Xác nhận hủy</AsyncButton>
      </div>
    </Modal>
  );
}
