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
type DatePreset = 'all' | 'today' | 'tomorrow' | 'weekend' | 'custom';
const datePresetLabels: Record<Exclude<DatePreset, 'custom'>, string> = {
  all: 'Tất cả',
  today: 'Hôm nay',
  tomorrow: 'Ngày mai',
  weekend: 'Cuối tuần',
};
const PRICE_MIN = 0;
const PRICE_MAX = 500_000;
const PRICE_STEP = 10_000;

function startOfDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}
function addDays(value: Date, amount: number): Date {
  const day = new Date(value);
  day.setDate(day.getDate() + amount);
  return day;
}
function resolveDateRange(preset: DatePreset, customDate: string): { startFrom?: string; endBefore?: string } {
  const today = startOfDay(new Date());
  switch (preset) {
    case 'today':
      return { startFrom: today.toISOString(), endBefore: addDays(today, 1).toISOString() };
    case 'tomorrow': {
      const start = addDays(today, 1);
      return { startFrom: start.toISOString(), endBefore: addDays(start, 1).toISOString() };
    }
    case 'weekend': {
      const saturday = addDays(today, (6 - today.getDay() + 7) % 7);
      return { startFrom: saturday.toISOString(), endBefore: addDays(saturday, 2).toISOString() };
    }
    case 'custom': {
      if (!customDate) return {};
      const start = startOfDay(new Date(`${customDate}T00:00:00`));
      if (Number.isNaN(start.getTime())) return {};
      return { startFrom: start.toISOString(), endBefore: addDays(start, 1).toISOString() };
    }
    default:
      return {};
  }
}
function toDateInputValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function MatchListPage() {
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [skill, setSkill] = useState<SkillTier | ''>('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDate, setCustomDate] = useState('');
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
    const { startFrom, endBefore } = resolveDateRange(datePreset, customDate);
    const feeMaxValue = Number(priceMax);
    const feeMinValue = Number(priceMin) || PRICE_MIN;
    try {
      const result = await listMatches({
        area: area.trim() || undefined,
        skill: skill || undefined,
        // Ở mốc tối đa (500k+) coi như không giới hạn trên; backend chỉ hỗ trợ feeMax.
        feeMax: priceMax && feeMaxValue < PRICE_MAX ? priceMax : undefined,
        startFrom,
        endBefore,
      });
      // Backend không có feeMin nên lọc chặn dưới phía client.
      const withinPrice = result.matches.filter((match) => Number(match.feePerSlot) >= feeMinValue);
      const hydrated = await Promise.all(
        withinPrice.map(async (match) => {
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
  // Tự lọc khi đổi bộ lọc; debounce để ô tìm kiếm không gọi API mỗi phím.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, skill, priceMin, priceMax, datePreset, customDate]);

  const hasActiveFilters = Boolean(area.trim() || skill || priceMin || priceMax || datePreset !== 'all');
  const resetFilters = () => {
    setArea('');
    setSkill('');
    setPriceMin('');
    setPriceMax('');
    setDatePreset('all');
    setCustomDate('');
  };
  const selectDatePreset = (preset: Exclude<DatePreset, 'custom'>) => {
    setDatePreset(preset);
    setCustomDate('');
  };

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
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.035em] text-ink-500">Bộ lọc kèo</h2>
            {hasActiveFilters && (
              <Button type="button" tone="ghost" size="sm" onClick={resetFilters}>
                Đặt lại
              </Button>
            )}
          </div>
          <div>
            <p className="mb-2 text-caption text-ink-500">Thời gian chơi</p>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(datePresetLabels) as Array<Exclude<DatePreset, 'custom'>>).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={datePreset === preset}
                  onClick={() => selectDatePreset(preset)}
                  className={`min-h-9 rounded-full border px-4 text-sm font-medium transition ${
                    datePreset === preset
                      ? 'border-brand-navy bg-brand-navy text-surface'
                      : 'border-line bg-surface text-ink-500 hover:border-brand-navy hover:text-brand-navy'
                  }`}
                >
                  {datePresetLabels[preset]}
                </button>
              ))}
              <TextInput
                aria-label="Chọn ngày cụ thể"
                type="date"
                className="h-9 w-auto py-1"
                min={toDateInputValue(new Date())}
                value={customDate}
                onChange={(event) => {
                  setCustomDate(event.target.value);
                  setDatePreset(event.target.value ? 'custom' : 'all');
                }}
              />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-caption text-ink-500">
              Khu vực hoặc tên sân
              <TextInput
                className="mt-1"
                aria-label="Khu vực hoặc tên sân"
                placeholder="VD: Cầu Giấy, Sân ABC…"
                value={area}
                onChange={(event) => setArea(event.target.value)}
              />
            </label>
            <label className="block text-caption text-ink-500">
              Bậc trình độ
              <SelectInput
                className="mt-1"
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
            </label>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-caption text-ink-500">
              <span>Khoảng phí / người</span>
              <span className="text-figures text-ink-700">
                {priceMin ? formatMoneyVnd(priceMin) : '0đ'} – {priceMax && Number(priceMax) < PRICE_MAX ? formatMoneyVnd(priceMax) : `${formatMoneyVnd(String(PRICE_MAX))}+`}
              </span>
            </div>
            <div className="relative h-10">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-100" aria-hidden="true" />
              {(() => {
                const lo = Math.max(PRICE_MIN, Math.min(PRICE_MAX, Number(priceMin) || PRICE_MIN));
                const hi = Math.max(PRICE_MIN, Math.min(PRICE_MAX, Number(priceMax) || PRICE_MAX));
                const left = (lo / PRICE_MAX) * 100;
                const right = 100 - (hi / PRICE_MAX) * 100;
                return <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-navy" style={{ left: `${left}%`, right: `${right}%` }} aria-hidden="true" />;
              })()}
              <input
                type="range" aria-label="Phí tối thiểu"
                min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                value={Number(priceMin) || PRICE_MIN}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const cap = Number(priceMax) || PRICE_MAX;
                  setPriceMin(String(Math.min(next, cap)));
                }}
                className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy"
              />
              <input
                type="range" aria-label="Phí tối đa"
                min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                value={Number(priceMax) || PRICE_MAX}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const floor = Number(priceMin) || PRICE_MIN;
                  setPriceMax(String(Math.max(next, floor)));
                }}
                className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy"
              />
            </div>
            <div className="mt-1 flex gap-2">
              <TextInput aria-label="Phí tối thiểu (nhập tay)" inputMode="numeric" value={priceMin} onChange={(event) => setPriceMin(event.target.value.replace(/\D/g, ''))} placeholder="0" />
              <TextInput aria-label="Phí tối đa (nhập tay)" inputMode="numeric" value={priceMax} onChange={(event) => setPriceMax(event.target.value.replace(/\D/g, ''))} placeholder={String(PRICE_MAX)} />
            </div>
          </div>
        </form>
      </SurfaceCard>
      {!loading && !error && (
        <p className="mt-6 text-sm text-ink-500" aria-live="polite">
          Tìm thấy <span className="font-semibold text-ink-900">{matches.length}</span> kèo phù hợp
        </p>
      )}
      {error && <div className="mt-6"><RouteState variant="error" title="Không thể tải danh sách kèo" description={error} onRetry={() => void load()} /></div>}
      {loading ? (
        <div className="mt-6"><RouteState variant="loading" title="Đang tải các kèo phù hợp" /></div>
      ) : matches.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Chưa có kèo phù hợp"
            description={hasActiveFilters ? 'Thử nới bộ lọc hoặc đặt lại để xem tất cả kèo đang mở.' : 'Đổi bộ lọc hoặc tạo kèo từ một booking đang giữ của bạn.'}
            action={
              hasActiveFilters
                ? <Button tone="secondary" onClick={resetFilters}>Đặt lại bộ lọc</Button>
                : <Button onClick={() => void openCreate()}>Tạo kèo</Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
