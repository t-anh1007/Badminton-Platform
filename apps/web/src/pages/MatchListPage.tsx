import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QuickMatchPanel } from '../components/QuickMatchPanel';
import { PageHeader } from '../components/courtin/PageHeader';
import {
  Button,
  EmptyState,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Toast,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { MatchCard, tierLabels } from '../components/MatchCard';
import { useAuthPrompt } from '../layout/AuthPrompt';
import { RouteState } from '../components/RouteState.js';
import { configureMatchSkillRange, getMatchDetail, listMatches, type MatchRow, type SkillTier } from '../lib/matchApi';
import { MatchCreatePanel } from '../components/MatchCreatePanel.js';
import { formatMoneyVnd } from '../lib/formatters.js';
import { useLiveDataRefresh } from '../realtime/dataInvalidation.js';

const tierOptions = Object.entries(tierLabels) as Array<[SkillTier, string]>;
type HydratedMatch = MatchRow;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const createdMatchId = searchParams.get('created');
  const setupRequested = searchParams.get('setup') === '1';
  const createOpen = searchParams.get('create') === '1';
  const createdCardRef = useRef<HTMLAnchorElement>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(createdMatchId);
  const [matches, setMatches] = useState<HydratedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [skill, setSkill] = useState<SkillTier | ''>('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customDate, setCustomDate] = useState('');
  const [notice, setNotice] = useState('');
  const [skillSetupOpen, setSkillSetupOpen] = useState(false);
  const [setupSkillMin, setSetupSkillMin] = useState<SkillTier | ''>('');
  const [setupSkillMax, setSetupSkillMax] = useState<SkillTier | ''>('');
  const [setupError, setSetupError] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const navigate = useNavigate();
  const promptAuth = useAuthPrompt();
  const [priceOpen, setPriceOpen] = useState(false);

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
  useLiveDataRefresh(load);

  useEffect(() => {
    if (loading || !createdMatchId || !matches.some((match) => match.id === createdMatchId)) return;
    setHighlightedMatchId(createdMatchId);
    createdCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    createdCardRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setHighlightedMatchId(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [createdMatchId, loading, matches]);

  useEffect(() => {
    if (!setupRequested || !createdMatchId) return;
    let active = true;
    void getMatchDetail(createdMatchId)
      .then((detail) => {
        if (!active) return;
        if (detail.skillConfiguredAt) {
          const next = new URLSearchParams(searchParams);
          next.delete('setup');
          setSearchParams(next, { replace: true });
          return;
        }
        setSkillSetupOpen(true);
      })
      .catch((cause) => {
        if (!active) return;
        setSkillSetupOpen(true);
        setSetupError(cause instanceof Error ? cause.message : 'Không thể tải thông tin thiết lập kèo.');
      });
    return () => { active = false; };
  }, [createdMatchId, searchParams, setSearchParams, setupRequested]);

  const saveSkillSetup = async () => {
    if (!createdMatchId || !setupSkillMin || !setupSkillMax) {
      setSetupError('Hãy chọn đầy đủ bậc tối thiểu và bậc tối đa.');
      return;
    }
    if (tierOptions.findIndex(([tier]) => tier === setupSkillMin) > tierOptions.findIndex(([tier]) => tier === setupSkillMax)) {
      setSetupError('Bậc tối thiểu không được cao hơn bậc tối đa.');
      return;
    }
    setSetupSaving(true);
    setSetupError('');
    try {
      await configureMatchSkillRange(createdMatchId, { skillMin: setupSkillMin, skillMax: setupSkillMax });
      const next = new URLSearchParams(searchParams);
      next.delete('setup');
      setSearchParams(next, { replace: true });
      setSkillSetupOpen(false);
      setNotice('Thiết lập hoàn tất — kèo đang tìm đối thủ.');
      setHighlightedMatchId(null);
      await load();
      setHighlightedMatchId(createdMatchId);
    } catch (cause) {
      setSetupError(cause instanceof Error ? cause.message : 'Không thể lưu bậc trình độ.');
    } finally {
      setSetupSaving(false);
    }
  };

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

  // Màn 01: tạo kèo ở chính trang danh sách (?create=1) để có thể liên kết trực tiếp.
  const openCreate = () => {
    if (!window.localStorage.getItem('accessToken')) {
      promptAuth({ title: 'Đăng nhập để tạo kèo' });
      return;
    }
    setNotice('');
    const next = new URLSearchParams(searchParams);
    next.set('create', '1');
    setSearchParams(next);
  };
  const closeCreate = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next);
  };

  if (createOpen) {
    return (
      <div className="page-container py-8 sm:py-10">
        <PageHeader eyebrow="Biến lượt đặt sân thành kèo cạnh tranh" title="Tạo kèo mới" description="Chọn lượt đặt sân, cấu hình kèo và kiểm tra toàn bộ dòng tiền trước khi công bố." />
        <div className="mt-6">
          <MatchCreatePanel onCancel={closeCreate} onCreated={(match) => navigate(`/matches/${match.id}`)} />
        </div>
      </div>
    );
  }

  const priceLabel = priceMin || (priceMax && Number(priceMax) < PRICE_MAX) ? `${priceMin ? formatMoneyVnd(priceMin) : '0đ'} – ${priceMax && Number(priceMax) < PRICE_MAX ? formatMoneyVnd(priceMax) : 'không giới hạn'}` : 'Mọi mức';
  const chip = (active: boolean) => `min-h-10 rounded-full border px-4 text-sm font-semibold transition ${active ? 'border-brand-navy bg-brand-navy text-surface' : 'border-line bg-surface text-ink-700 hover:border-brand-navy hover:text-brand-navy'}`;

  return (
    <div className="page-container py-8 sm:py-10">
      {notice && <Toast message={notice} tone={notice.includes('thành công') || notice.includes('hoàn tất') ? 'success' : 'error'} />}
      <PageHeader eyebrow="Cùng ra sân" title="Kèo cầu lông đang mở" description="Chọn đúng bậc, thời gian và mức phí phù hợp." actions={<Button size="lg" onClick={openCreate}><Icon name="plus" className="h-4 w-4" />Tạo kèo</Button>} />
      {createdMatchId && !setupRequested && <div role="status" className="mt-5 rounded-xl border border-success bg-success-bg p-4 text-sm text-success">Kèo đã được tạo và đang tìm đối thủ.{!loading && !matches.some((match) => match.id === createdMatchId) && <> <Link className="font-bold underline" to={`/matches/${encodeURIComponent(createdMatchId)}`}>Xem kèo vừa tạo</Link></>}</div>}
      <div className="mt-6">
        <QuickMatchPanel />
      </div>
      <form
        className="surface-card mt-4 grid gap-3 p-4 lg:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(datePresetLabels) as Array<Exclude<DatePreset, 'custom'>>).map((preset) => (
            <button key={preset} type="button" aria-pressed={datePreset === preset} onClick={() => selectDatePreset(preset)} className={chip(datePreset === preset)}>{datePresetLabels[preset]}</button>
          ))}
          <TextInput
            aria-label="Chọn ngày cụ thể"
            type="date"
            className={`!h-10 !w-44 !py-1 ${datePreset === 'custom' ? '!border-brand-navy' : ''}`}
            min={toDateInputValue(new Date())}
            value={customDate}
            onChange={(event) => {
              setCustomDate(event.target.value);
              setDatePreset(event.target.value ? 'custom' : 'all');
            }}
          />
        </div>
        <span className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500" />
          <TextInput className="pl-10" aria-label="Khu vực hoặc tên sân" placeholder="Khu vực hoặc tên sân" value={area} onChange={(event) => setArea(event.target.value)} />
        </span>
        <SelectInput aria-label="Bậc trình độ" value={skill} onChange={(event) => setSkill(event.target.value as SkillTier | '')}>
          <option value="">Mọi bậc</option>
          {tierOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectInput>
        <div className="relative">
          <button type="button" aria-expanded={priceOpen} onClick={() => setPriceOpen((open) => !open)} className="flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-left"><span className="truncate"><span className="text-ink-500">Phí: </span><b className="font-semibold">{priceLabel}</b></span><Icon name="chevronDown" className={`h-4 w-4 transition ${priceOpen ? 'rotate-180' : ''}`} /></button>
          {priceOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-raised)]">
              <div className="relative h-8">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line" aria-hidden="true" />
                <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-navy" style={{ left: `${(Math.min(PRICE_MAX, Number(priceMin) || PRICE_MIN) / PRICE_MAX) * 100}%`, right: `${100 - (Math.min(PRICE_MAX, Number(priceMax) || PRICE_MAX) / PRICE_MAX) * 100}%` }} aria-hidden="true" />
                <input type="range" aria-label="Phí tối thiểu" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={Number(priceMin) || PRICE_MIN} onChange={(event) => setPriceMin(String(Math.min(Number(event.target.value), Number(priceMax) || PRICE_MAX)))} className={rangeClass} />
                <input type="range" aria-label="Phí tối đa" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={Number(priceMax) || PRICE_MAX} onChange={(event) => setPriceMax(String(Math.max(Number(event.target.value), Number(priceMin) || PRICE_MIN)))} className={rangeClass} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <TextInput aria-label="Phí tối thiểu (nhập tay)" inputMode="numeric" value={priceMin} onChange={(event) => setPriceMin(event.target.value.replace(/\D/g, ''))} placeholder="0" />
                <TextInput aria-label="Phí tối đa (nhập tay)" inputMode="numeric" value={priceMax} onChange={(event) => setPriceMax(event.target.value.replace(/\D/g, ''))} placeholder={String(PRICE_MAX)} />
              </div>
              <div className="mt-4 flex justify-between"><Button tone="ghost" size="sm" onClick={() => { setPriceMin(''); setPriceMax(''); }}>Đặt lại</Button><Button size="sm" onClick={() => setPriceOpen(false)}>Xong</Button></div>
            </div>
          )}
        </div>
        <Button type="button" tone="ghost" size="sm" disabled={!hasActiveFilters} onClick={resetFilters}>Đặt lại</Button>
      </form>
      {!loading && !error && (
        <p className="mt-6 text-sm text-ink-500" aria-live="polite">
          <span className="text-figures font-semibold text-ink-900">{matches.length}</span> kèo đang mở · sắp diễn ra trước
        </p>
      )}
      {error ? (
        <div className="mt-6"><RouteState variant="error" title="Chưa tải được danh sách kèo" description="Máy chủ đang bận hoặc kết nối bị gián đoạn. Hãy thử lại." onRetry={() => void load()} /></div>
      ) : loading ? (
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-48 !rounded-2xl" />)}</div>
      ) : matches.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Chưa có kèo phù hợp"
            description={hasActiveFilters ? 'Thử nới bộ lọc để xem thêm kèo.' : 'Hãy tự tạo kèo từ một lượt đặt sân của bạn.'}
            action={
              hasActiveFilters
                ? <Button tone="secondary" onClick={resetFilters}>Đặt lại bộ lọc</Button>
                : <Button onClick={openCreate}>Tạo kèo</Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => <MatchCard key={match.id} match={match} highlighted={match.id === highlightedMatchId} ref={match.id === createdMatchId ? createdCardRef : undefined} />)}
        </div>
      )}
      <Modal open={skillSetupOpen} title="Thiết lập bậc trình độ" dismissible={false} onClose={() => undefined}>
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Chọn khoảng trình độ phù hợp. Kèo sẽ xuất hiện để tìm đối thủ ngay sau khi lưu.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Bậc tối thiểu
              <SelectInput className="mt-1" aria-label="Bậc tối thiểu" value={setupSkillMin} onChange={(event) => { setSetupSkillMin(event.target.value as SkillTier | ''); setSetupError(''); }}>
                <option value="">Chọn bậc</option>
                {tierOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectInput>
            </label>
            <label className="block text-sm font-medium">
              Bậc tối đa
              <SelectInput className="mt-1" aria-label="Bậc tối đa" value={setupSkillMax} onChange={(event) => { setSetupSkillMax(event.target.value as SkillTier | ''); setSetupError(''); }}>
                <option value="">Chọn bậc</option>
                {tierOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectInput>
            </label>
          </div>
          {setupSkillMin && setupSkillMax && <div className="rounded-xl bg-canvas p-3 text-sm text-ink-700">Đối thủ phù hợp: <b>{tierLabels[setupSkillMin]} – {tierLabels[setupSkillMax]}</b></div>}
          {setupError && <p role="alert" className="text-sm text-danger">{setupError}</p>}
          <div className="flex justify-end">
            <Button disabled={setupSaving} onClick={() => void saveSkillSetup()}>{setupSaving ? 'Đang lưu…' : 'Lưu và mở kèo'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const rangeClass = 'pointer-events-none absolute inset-0 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand-navy [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand-navy';
