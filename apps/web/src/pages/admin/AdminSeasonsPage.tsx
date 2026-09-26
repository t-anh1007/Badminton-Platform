import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { VIETNAM_PROVINCES } from '@khoaluantn/shared';
import { AsyncButton, Badge, Button, Modal, Pagination, SelectInput, SurfaceCard, TextInput } from '../../components/ui';
import { formatDateVi } from '../../lib/formatters.js';
import {
  closeSeason, createSeason, getLeaderboard, listAdminSeasons, updateSeason,
  type AdminSeason, type Leaderboard, type LeaderboardBand,
} from '../../lib/competitionApi';
import type { Discipline } from '../../lib/passportApi';

const STATUS: Record<AdminSeason['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Đang diễn ra', tone: 'success' },
  scheduled: { label: 'Sắp diễn ra', tone: 'neutral' },
  closing: { label: 'Chờ đóng kỳ', tone: 'warning' },
  closed: { label: 'Đã kết thúc', tone: 'neutral' },
};
// Ngày nhập theo giờ Việt Nam; ngày kết thúc tính trọn ngày nên mốc kết thúc là 00:00 ngày hôm sau.
const dayStart = (date: string) => new Date(`${date}T00:00:00+07:00`);
const lastDay = (endAt: string) => formatDateVi(new Date(new Date(endAt).getTime() - 1));
const range = (season: AdminSeason) => `${formatDateVi(season.startAt)} - ${lastDay(season.endAt)}`;
const nextDayStart = (date: string) => { const at = dayStart(date); at.setUTCDate(at.getUTCDate() + 1); return at; };
/** Mốc ISO → YYYY-MM-DD theo giờ Việt Nam cho ô nhập ngày; ngày cuối = endAt lùi 1 ms. */
const inputDate = (at: string | number) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const inputLastDay = (endAt: string) => inputDate(new Date(endAt).getTime() - 1);
const provinceName = (code: string | null) => VIETNAM_PROVINCES.find((item) => item.code === code)?.name ?? '';
const daysLeft = (endAt: string) => Math.max(0, Math.ceil((new Date(endAt).getTime() - Date.now()) / 86_400_000));

/** Màn 11: một lịch kỳ toàn nền tảng, kỳ không chồng nhau; giải riêng từng tỉnh dùng chương trình thưởng phạm vi tỉnh/thành. */
export function AdminSeasonsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminSeason[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<AdminSeason | null>(null);
  const [message, setMessage] = useState('');
  const load = useCallback(() => {
    listAdminSeasons(page).then(setData, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải kỳ xếp hạng.'));
  }, [page]);
  useEffect(load, [load]);
  const active = data?.items.find((season) => season.status === 'active');
  const next = data?.items.find((season) => season.status === 'scheduled');

  const close = async (season: AdminSeason) => {
    try {
      await closeSeason(season.id);
      setMessage(`Đã đóng ${season.name}.`);
      load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Không thể đóng kỳ.'); }
  };

  return (
    <>
      <h2 className="text-h1">Quản lý kỳ xếp hạng</h2>
      <p className="mt-2 text-ink-500">Mỗi thời điểm chỉ có một kỳ áp dụng chung cho bảng đánh đơn và đánh đôi. Mỗi kỳ đã có bảng riêng cho từng tỉnh/thành; muốn tổ chức giải riêng cho một tỉnh/thành, tạo chương trình thưởng phạm vi tỉnh/thành.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <SurfaceCard><p className="text-xs text-ink-500">Kỳ đang diễn ra</p><p className="mt-1 whitespace-nowrap text-h3">{active?.name ?? 'Chưa có'}</p>{active && <p className="text-xs text-ink-500">Còn {daysLeft(active.endAt)} ngày</p>}</SurfaceCard>
        <SurfaceCard><p className="text-xs text-ink-500">Người đủ điều kiện lên bảng</p><p className="text-figures mt-1 text-h3">{(active?.eligiblePlayerCount ?? 0).toLocaleString('vi-VN')}</p><p className="text-xs text-ink-500">Đơn và đôi</p></SurfaceCard>
        <SurfaceCard><p className="text-xs text-ink-500">Kỳ tiếp theo</p><p className="mt-1 whitespace-nowrap text-h3">{next?.name ?? 'Chưa công bố'}</p>{next && <p className="text-xs text-ink-500">Bắt đầu {formatDateVi(next.startAt)}</p>}</SurfaceCard>
      </div>
      {message && <p role="status" className="mt-4 rounded-xl bg-info-bg p-3 text-sm">{message}</p>}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SurfaceCard>
          <h3 className="text-h3">Danh sách kỳ xếp hạng</h3>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : !data ? <p className="mt-3 text-sm text-ink-500">Đang tải…</p> : data.items.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">Chưa có kỳ nào. Tạo kỳ đầu tiên ở khung bên cạnh.</p>
          ) : (
            <table className="mt-3 w-full table-fixed text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-500">
                <th scope="col" className="py-2">Tên kỳ</th><th scope="col" className="w-44 py-2">Thời gian</th><th scope="col" className="w-32 py-2">Trạng thái</th><th scope="col" className="w-32 py-2"><span className="sr-only">Thao tác</span></th>
              </tr></thead>
              <tbody>
                {data.items.map((season) => (
                  <tr key={season.id} className="border-b border-line last:border-0">
                    <td className="py-3 pr-2"><p className="whitespace-nowrap font-semibold text-brand-navy">{season.name}</p></td>
                    <td className="py-3 text-xs">{range(season)}</td>
                    <td className="py-3"><Badge tone={STATUS[season.status].tone}>{STATUS[season.status].label}</Badge></td>
                    <td className="py-3 text-right">
                      {season.status === 'closing'
                        ? <Button size="sm" onClick={() => void close(season)}>Đóng kỳ</Button>
                        : <Button size="sm" tone="secondary" onClick={() => setViewing(season)}>Xem</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data && data.total > data.pageSize && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} /></div>}
        </SurfaceCard>
        <CreateSeasonForm onCreated={(name) => { setMessage(`Đã tạo ${name}.`); load(); }} />
      </div>
      <Modal open={viewing !== null} title={viewing?.name ?? ''} onClose={() => setViewing(null)}>
        {viewing && <SeasonDetail season={viewing} onSaved={(name) => { setMessage(`Đã cập nhật ${name}.`); setViewing(null); load(); }} />}
      </Modal>
    </>
  );
}

function CreateSeasonForm({ onCreated }: { onCreated: (name: string) => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !start || !end) { setError('Nhập tên kỳ, ngày bắt đầu và ngày kết thúc.'); return; }
    if (end < start) { setError('Ngày kết thúc phải sau ngày bắt đầu.'); return; }
    const endAt = nextDayStart(end);
    setPending(true);
    setError('');
    try {
      await createSeason({ name: name.trim(), startAt: dayStart(start).toISOString(), endAt: endAt.toISOString() });
      onCreated(name.trim());
      setName(''); setStart(''); setEnd('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo kỳ.'); } finally { setPending(false); }
  };
  return (
    <SurfaceCard className="h-fit">
      <form noValidate onSubmit={(event) => void submit(event)}>
        <h3 className="text-h3">Tạo kỳ tiếp theo</h3>
        <p className="mt-1 text-sm text-ink-500">Kỳ mới bắt đầu sau khi kỳ hiện tại kết thúc.</p>
        <label className="mt-4 block text-sm font-bold">Tên kỳ hiển thị<TextInput className="mt-1" value={name} placeholder="Tháng 11-12/2026" onChange={(event) => setName(event.target.value)} /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-bold">Ngày bắt đầu<TextInput className="mt-1" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="block text-sm font-bold">Ngày kết thúc<TextInput className="mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">Thời gian các kỳ không được trùng nhau.</p>
        <p className="mt-2 rounded-xl bg-canvas p-3 text-xs text-ink-700">Khi sang kỳ mới, điểm xếp hạng và mức độ ổn định được giữ nguyên. Số trận, số trận thắng, chuỗi thắng và điều kiện lên bảng được tính lại.</p>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <AsyncButton type="submit" className="mt-3 w-full" pending={pending}>Tạo kỳ</AsyncButton>
      </form>
    </SurfaceCard>
  );
}

/** Popup Xem: sửa tên/thời gian kỳ (kỳ đã đóng thì khóa) và xem bảng xếp hạng của chính kỳ đó. */
function SeasonDetail({ season, onSaved }: { season: AdminSeason; onSaved: (name: string) => void }) {
  const editable = season.status !== 'closed';
  const started = season.status !== 'scheduled';
  const [name, setName] = useState(season.name);
  const [start, setStart] = useState(inputDate(season.startAt));
  const [end, setEnd] = useState(inputLastDay(season.endAt));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !start || !end) { setError('Nhập tên kỳ, ngày bắt đầu và ngày kết thúc.'); return; }
    if (end < start) { setError('Ngày kết thúc phải sau ngày bắt đầu.'); return; }
    // Chỉ gửi mốc đã đổi để giữ nguyên mốc gốc của kỳ.
    const body: { name: string; startAt?: string; endAt?: string } = { name: name.trim() };
    if (start !== inputDate(season.startAt)) body.startAt = dayStart(start).toISOString();
    if (end !== inputLastDay(season.endAt)) body.endAt = nextDayStart(end).toISOString();
    setPending(true);
    setError('');
    try { await updateSeason(season.id, body); onSaved(body.name); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể cập nhật kỳ.'); } finally { setPending(false); }
  };
  return (
    <>
      <dl className="divide-y divide-line text-sm">
        <div className="flex justify-between py-2"><dt>Thời gian</dt><dd className="font-semibold">{range(season)}</dd></div>
        <div className="flex justify-between py-2"><dt>Trạng thái</dt><dd className="font-semibold">{STATUS[season.status].label}</dd></div>
        <div className="flex justify-between py-2"><dt>Người đủ điều kiện lên bảng</dt><dd className="font-semibold">{season.eligiblePlayerCount.toLocaleString('vi-VN')}</dd></div>
      </dl>
      {editable && (
        <form noValidate className="mt-3 rounded-2xl border border-line p-4" onSubmit={(event) => void save(event)}>
          <h3 className="text-h3">Sửa thông tin kỳ</h3>
          <label className="mt-3 block text-sm font-bold">Tên kỳ hiển thị<TextInput className="mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">Ngày bắt đầu<TextInput className="mt-1" type="date" value={start} disabled={started} onChange={(event) => setStart(event.target.value)} /></label>
            <label className="block text-sm font-bold">Ngày kết thúc<TextInput className="mt-1" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          </div>
          {started && <p className="mt-2 text-xs text-ink-500">Kỳ đã bắt đầu nên không đổi được ngày bắt đầu.</p>}
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          <AsyncButton type="submit" className="mt-3" pending={pending}>Lưu thay đổi</AsyncButton>
        </form>
      )}
      <SeasonLeaderboard seasonId={season.id} />
    </>
  );
}

const BOARD_PAGE_SIZE = 10;

/** BXH của một kỳ cụ thể; kỳ đã đóng hiển thị điểm chụp lúc đóng kỳ. */
function SeasonLeaderboard({ seasonId }: { seasonId: string }) {
  const [discipline, setDiscipline] = useState<Discipline>('singles');
  const [band, setBand] = useState<LeaderboardBand>('under_1600');
  const [provinceCode, setProvinceCode] = useState('');
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setBoard(null);
    setError('');
    getLeaderboard({ seasonId, discipline, band, scope: provinceCode ? 'province' : 'global', provinceCode: provinceCode || undefined, page, pageSize: BOARD_PAGE_SIZE })
      .then(setBoard, (cause) => setError(cause instanceof Error ? cause.message : 'Không thể tải bảng xếp hạng.'));
  }, [seasonId, discipline, band, provinceCode, page]);
  return (
    <section className="mt-4">
      <h3 className="text-h3">Bảng xếp hạng của kỳ</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-bold">Nội dung
          <SelectInput className="mt-1" value={discipline} onChange={(event) => { setDiscipline(event.target.value as Discipline); setPage(1); }}>
            <option value="singles">Đánh đơn</option><option value="doubles">Đánh đôi</option>
          </SelectInput>
        </label>
        <label className="block text-xs font-bold">Nhóm điểm
          <SelectInput className="mt-1" value={band} onChange={(event) => { setBand(event.target.value as LeaderboardBand); setPage(1); }}>
            <option value="under_1600">Dưới 1.600</option><option value="from_1600">Từ 1.600</option>
          </SelectInput>
        </label>
        <label className="block text-xs font-bold">Phạm vi
          <SelectInput className="mt-1" value={provinceCode} onChange={(event) => { setProvinceCode(event.target.value); setPage(1); }}>
            <option value="">Toàn nền tảng</option>
            {VIETNAM_PROVINCES.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </SelectInput>
        </label>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : !board ? <p className="mt-3 text-sm text-ink-500">Đang tải…</p> : board.items.length === 0 ? (
        <p className="mt-3 rounded-xl bg-canvas p-3 text-sm text-ink-700">Chưa có người chơi đủ điều kiện ở bảng này.</p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-500">
                <th scope="col" className="py-2">Hạng</th><th scope="col" className="py-2">Người chơi</th><th scope="col" className="py-2 text-right">Điểm</th><th scope="col" className="py-2 text-right">Trận</th><th scope="col" className="py-2 text-right">Thắng</th>
              </tr></thead>
              <tbody>
                {board.items.map((row) => (
                  <tr key={row.userId} className="border-b border-line last:border-0">
                    <td className="text-figures py-2 font-bold">{row.rank}</td>
                    <td className="py-2"><p className="font-semibold text-brand-navy">{row.displayName}</p>{row.provinceCode && <p className="text-xs text-ink-500">{provinceName(row.provinceCode)}</p>}</td>
                    <td className="text-figures py-2 text-right font-semibold">{row.rating.toLocaleString('vi-VN')}</td>
                    <td className="text-figures py-2 text-right">{row.matchesPlayed}</td>
                    <td className="text-figures py-2 text-right">{row.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {board.total > BOARD_PAGE_SIZE && <div className="mt-3"><Pagination page={page} pageCount={Math.ceil(board.total / BOARD_PAGE_SIZE)} onChange={setPage} /></div>}
        </>
      )}
    </section>
  );
}
