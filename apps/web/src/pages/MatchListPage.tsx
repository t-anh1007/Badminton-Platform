import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QuickMatchPanel } from '../components/QuickMatchPanel';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  SelectInput,
  Skeleton,
  SurfaceCard,
  TextInput,
  Toast,
} from '../components/ui';
import { createMatch, getMatchDetail, listMatches, type MatchRow, type SkillTier } from '../lib/matchApi';
import { getMyUpcomingBookings, type BookingSummary } from '../lib/venueBookingApi';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi',
  beginner: 'Yếu',
  intermediate: 'Trung bình',
  intermediate_plus: 'Trung bình khá',
  advanced: 'Bán chuyên',
};
const tierOptions = Object.entries(tierLabels) as Array<[SkillTier, string]>;
type HydratedMatch = MatchRow & {
  organizer?: { displayName: string; tier: SkillTier | null };
};
const money = (value: string) => (Number(value) === 0 ? 'Miễn phí' : `${Number(value).toLocaleString('vi-VN')}₫`);
const skillRange = (row: MatchRow) =>
  row.skillMin || row.skillMax
    ? `${row.skillMin ? tierLabels[row.skillMin] : 'Mọi bậc'} – ${row.skillMax ? tierLabels[row.skillMax] : 'Mọi bậc'}`
    : 'Mọi bậc';

export function MatchListPage() {
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [skill, setSkill] = useState<SkillTier | ''>('');
  const [date, setDate] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [heldBookings, setHeldBookings] = useState<BookingSummary[]>([]);
  const [bookingId, setBookingId] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [feeMode, setFeeMode] = useState<'free' | 'split'>('split');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listMatches({
        area: area.trim() || undefined,
        skill: skill || undefined,
        startFrom: date ? new Date(date).toISOString() : undefined,
      });
      const hydrated = await Promise.all(
        result.matches.map(async (match) => {
          try {
            const detail = await getMatchDetail(match.id);
            return { ...match, organizer: detail.organizer };
          } catch {
            return match;
          }
        }),
      );
      setMatches(hydrated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách kèo.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const openCreate = async () => {
    if (!window.localStorage.getItem('accessToken')) {
      navigate('/auth');
      return;
    }
    setCreateOpen(true);
    setNotice('');
    try {
      const bookings = (await getMyUpcomingBookings()).filter((booking) => booking.status === 'held');
      setHeldBookings(bookings);
      setBookingId(bookings[0]?.id ?? '');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể tải slot đang giữ.');
    }
  };
  const submitCreate = async () => {
    if (!bookingId) return;
    try {
      const match = await createMatch({ bookingId, capacity, feeMode });
      setCreateOpen(false);
      navigate(`/matches/${match.id}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể tạo kèo.');
    }
  };

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast message={notice} tone={notice.includes('thành công') ? 'success' : 'error'} />}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-caption uppercase tracking-[0.14em] text-green-700">Cùng ra sân</p>
          <h1 className="mt-1 text-h1">Kèo cầu lông đang mở</h1>
          <p className="mt-2 text-sm text-ink-500">Chọn đúng bậc, thời gian và phần phí bạn thấy phù hợp.</p>
        </div>
        <Button onClick={() => void openCreate()}>Tạo kèo từ slot đang giữ</Button>
      </div>
      <div className="mt-6">
        <QuickMatchPanel />
      </div>
      <SurfaceCard className="mt-6">
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <TextInput
            aria-label="Khu vực"
            placeholder="Khu vực hoặc tên sân"
            value={area}
            onChange={(event) => setArea(event.target.value)}
          />
          <SelectInput
            aria-label="Bậc trình độ"
            value={skill}
            onChange={(event) => setSkill(event.target.value as SkillTier | '')}
          >
            <option value="">Mọi bậc</option>
            {tierOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectInput>
          <TextInput
            aria-label="Từ ngày giờ"
            type="datetime-local"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Button type="submit" tone="secondary">
            Lọc kèo
          </Button>
        </form>
      </SurfaceCard>
      {error && (
        <div className="mt-6 rounded-xl border border-danger bg-danger-bg p-4 text-sm text-danger">
          {error}{' '}
          <button className="font-semibold underline" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}
      {loading ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-64" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Chưa có kèo phù hợp"
            description="Đổi bộ lọc hoặc tạo kèo từ một booking đang giữ của bạn."
            action={<Button onClick={() => void openCreate()}>Tạo kèo</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => (
            <Link
              key={match.id}
              to={`/matches/${match.id}`}
              className="surface-card group block p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-caption">
                    {match.capacity === 2 ? 'Kèo đơn' : 'Kèo đôi'} · {match.openSlots > 0 ? 'Mở' : 'Đầy'}
                  </p>
                  <h2 className="mt-1 font-semibold text-ink-900 group-hover:text-green-700">{match.venue.name}</h2>
                </div>
                <Badge tone={match.openSlots <= 1 ? 'warning' : 'success'}>Còn {match.openSlots} chỗ</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-green-100 font-bold text-green-700">
                  {match.organizer?.displayName?.slice(0, 1) ?? 'T'}
                </span>
                <div>
                  <p className="text-sm font-medium">{match.organizer?.displayName ?? 'Organizer'}</p>
                  <p className="text-caption">
                    {match.organizer?.tier ? tierLabels[match.organizer.tier] : 'Chưa công bố bậc'}
                  </p>
                </div>
              </div>
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Thời gian</dt>
                  <dd className="text-right font-medium">{new Date(match.startAt).toLocaleString('vi-VN')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Sân</dt>
                  <dd className="text-right">{match.court.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Phí</dt>
                  <dd className="text-figures font-semibold text-green-700">{money(match.feePerSlot)}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <Badge>{skillRange(match)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={createOpen} title="Tạo kèo từ booking đang giữ" onClose={() => setCreateOpen(false)}>
        {heldBookings.length === 0 ? (
          <EmptyState
            title="Chưa có slot đang giữ"
            description="Hãy chọn sân và tạo booking held trước khi mở kèo."
            action={<Button onClick={() => navigate('/venues')}>Chọn sân</Button>}
          />
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Booking held
              <SelectInput className="mt-1" value={bookingId} onChange={(event) => setBookingId(event.target.value)}>
                {heldBookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.court?.venue?.name ?? 'Sân'} · {new Date(booking.startAt).toLocaleString('vi-VN')}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="block text-sm font-medium">
              Số người
              <TextInput
                className="mt-1"
                type="number"
                min={2}
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
            </label>
            <label className="block text-sm font-medium">
              Chia phí
              <SelectInput
                className="mt-1"
                value={feeMode}
                onChange={(event) => setFeeMode(event.target.value as 'free' | 'split')}
              >
                <option value="split">Chia đều phí sân</option>
                <option value="free">Organizer trả toàn bộ</option>
              </SelectInput>
            </label>
            <div className="flex justify-end gap-2">
              <Button tone="secondary" onClick={() => setCreateOpen(false)}>
                Đóng
              </Button>
              <Button onClick={() => void submitCreate()}>Tạo kèo</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
