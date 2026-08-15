import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QuickMatchPanel } from '../components/QuickMatchPanel';
import { PageHeader } from '../components/courtin/PageHeader';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  SelectInput,
  SurfaceCard,
  TextInput,
  Toast,
} from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { createMatch, getMatchDetail, listMatches, type MatchRow, type SkillTier } from '../lib/matchApi';
import { getMyMatchSources, type MatchBookingSource, type MatchHoldSource } from '../lib/venueBookingApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';

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
type MatchSource = ({ kind: 'booking' } & MatchBookingSource) | ({ kind: 'hold' } & MatchHoldSource);
const money = (value: string) => (Number(value) === 0 ? 'Miễn phí' : formatMoneyVnd(value));
const skillRange = (row: MatchRow) =>
  row.skillMin || row.skillMax
    ? `${row.skillMin ? tierLabels[row.skillMin] : 'Mọi bậc'} – ${row.skillMax ? tierLabels[row.skillMax] : 'Mọi bậc'}`
    : 'Mọi bậc';
function parseVietnameseDateTime(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day) || date.getHours() !== Number(hour) || date.getMinutes() !== Number(minute)) return null;
  return date.toISOString();
}

export function MatchListPage() {
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [skill, setSkill] = useState<SkillTier | ''>('');
  const [date, setDate] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [matchSources, setMatchSources] = useState<MatchSource[]>([]);
  const [sourceKey, setSourceKey] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [feeMode, setFeeMode] = useState<'free' | 'split'>('split');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    let startFrom: string | undefined;
    if (date) {
      const parsed = parseVietnameseDateTime(date);
      if (!parsed) {
        setError('Ngày giờ phải theo định dạng dd/MM/yyyy HH:mm.');
        setLoading(false);
        return;
      }
      startFrom = parsed;
    }
    try {
      const result = await listMatches({
        area: area.trim() || undefined,
        skill: skill || undefined,
        startFrom,
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
      const result = await getMyMatchSources();
      const sources: MatchSource[] = [
        ...result.holds.map((hold) => ({ ...hold, kind: 'hold' as const })),
        ...result.bookings.map((booking) => ({ ...booking, kind: 'booking' as const })),
      ];
      setMatchSources(sources);
      setSourceKey(sources[0] ? `${sources[0].kind}:${sources[0].id}` : '');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể tải slot đang giữ.');
    }
  };
  const submitCreate = async () => {
    if (!sourceKey) return;
    try {
      const [kind, id] = sourceKey.split(':') as ['booking' | 'hold', string];
      const match = await createMatch({ ...(kind === 'booking' ? { bookingId: id } : { holdId: id }), capacity, feeMode });
      setCreateOpen(false);
      navigate(`/matches/${match.id}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Không thể tạo kèo.');
    }
  };

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast message={notice} tone={notice.includes('thành công') ? 'success' : 'error'} />}
      <PageHeader eyebrow="Cùng ra sân" title="Kèo cầu lông đang mở" description="Chọn đúng bậc, thời gian và phần phí bạn thấy phù hợp." actions={<Button onClick={() => void openCreate()}>Tạo kèo từ slot đang giữ</Button>} />
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
            inputMode="numeric"
            placeholder="dd/MM/yyyy HH:mm"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Button type="submit" tone="secondary">
            Lọc kèo
          </Button>
        </form>
      </SurfaceCard>
      {error && <div className="mt-6"><RouteState variant="error" title="Không thể tải danh sách kèo" description={error} onRetry={() => void load()} /></div>}
      {loading ? (
        <div className="mt-6"><RouteState variant="loading" title="Đang tải các kèo phù hợp" /></div>
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
              className="surface-card group block p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-caption">
                    {match.capacity === 2 ? 'Kèo đơn' : 'Kèo đôi'} · {match.openSlots > 0 ? 'Mở' : 'Đầy'}
                  </p>
                  <h2 className="mt-1 font-display font-extrabold text-ink-900 group-hover:text-brand-navy">{match.venue.name}</h2>
                </div>
                <Badge tone={match.openSlots <= 1 ? 'warning' : 'success'}>Còn {match.openSlots} chỗ</Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-yellow font-bold text-brand-navy">
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
                  <dd className="text-right font-medium">{formatDateTimeVi(match.startAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Sân</dt>
                  <dd className="text-right">{match.court.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Phí</dt>
                  <dd className="text-figures font-semibold text-brand-navy">{money(match.feePerSlot)}</dd>
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
        {matchSources.length === 0 ? (
          <EmptyState
            title="Chưa có nguồn tạo kèo hợp lệ"
            description="Hãy giữ một khung giờ hoặc tạo booking đang chờ thanh toán trước khi mở kèo."
            action={<Button onClick={() => navigate('/venues')}>Chọn sân</Button>}
          />
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Sân và thời gian đã giữ
              <SelectInput aria-label="Nguồn tạo kèo" className="mt-1" value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>
                {matchSources.map((source) => (
                  <option key={`${source.kind}:${source.id}`} value={`${source.kind}:${source.id}`}>
                    {source.court.venue.name} · {source.court.name} · {formatDateTimeVi(source.startAt)} · {source.kind === 'hold' ? 'Đang giữ' : 'Chờ thanh toán'}
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
