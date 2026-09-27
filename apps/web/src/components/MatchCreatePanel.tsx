import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, SelectInput, SurfaceCard } from './ui';
import { RouteState } from './RouteState.js';
import {
  createMatch, getFundingPreview,
  type MatchDiscipline, type MatchFormat, type MatchFundingPreview, type MatchMode, type MatchRatio, type MatchRow, type SkillTier,
} from '../lib/matchApi';
import { getMyMatchSources, type MatchSource } from '../lib/venueBookingApi';
import { getOwnPassport, type OwnPassport } from '../lib/passportApi';
import { formatDateTimeVi, formatMoneyVnd } from '../lib/formatters.js';

const tierLabels: Record<SkillTier, string> = {
  newcomer: 'Mới chơi', beginner: 'Yếu', intermediate: 'Trung bình', intermediate_plus: 'Trung bình khá', advanced: 'Bán chuyên',
};
const tiers = Object.keys(tierLabels) as SkillTier[];
const ratioLabels: Record<MatchRatio, string> = { '5:5': 'Thua 50% - thắng 50%', '6:4': 'Thua 60% - thắng 40%', '7:3': 'Thua 70% - thắng 30%' };
const sourceKey = (source: MatchSource) => `${source.sourceType}:${source.holdId ?? source.bookingId}`;
/** BR-CM-08: slot trên 90 phút mới được chọn BO5. */
const allowsBo5 = (source: MatchSource | undefined) =>
  Boolean(source && new Date(source.endAt).getTime() - new Date(source.startAt).getTime() > 90 * 60_000);

function ChoiceGroup<T extends string>({ legend, value, options, onChange, columns = 2 }: {
  legend: string; value: T; onChange: (value: NoInfer<T>) => void; columns?: 2 | 3;
  options: Array<{ value: T; title: string; description: string; disabled?: boolean }>;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="text-sm font-bold text-ink-900">{legend}</legend>
      <div className={`mt-2 grid gap-3 ${columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className={`relative block cursor-pointer rounded-2xl border-2 p-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-green-100 ${
              option.disabled ? 'cursor-not-allowed opacity-50' : ''
            } ${value === option.value ? 'border-brand-navy bg-canvas' : 'border-line bg-surface hover:border-brand-navy'}`}
          >
            <input
              type="radio" name={name} value={option.value} className="sr-only" checked={value === option.value}
              disabled={option.disabled} onChange={() => onChange(option.value)}
            />
            <span className="block font-semibold text-brand-navy">{option.title}</span>
            <span className="mt-1 block text-xs text-ink-500">{option.description}</span>
            {value === option.value && <span aria-hidden="true" className="absolute right-3 top-3 text-brand-navy">✓</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MoneyRow({ label, hint, value, badge }: { label: string; hint: string; value: string; badge?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-ink-900">{label}</p>
        <p className="text-xs text-ink-500">{hint}</p>
      </div>
      <div className="text-right">
        <p className="text-figures font-bold text-brand-navy">{formatMoneyVnd(value)}</p>
        {badge}
      </div>
    </div>
  );
}

/** Màn 01 đã duyệt: chọn nguồn trước, rồi chế độ/hình thức/tỷ lệ/trình độ/thể thức; tiền lấy từ backend. */
export function MatchCreatePanel({ onCancel, onCreated }: { onCancel: () => void; onCreated: (match: MatchRow) => void }) {
  const [sources, setSources] = useState<MatchSource[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sourceType, setSourceType] = useState<MatchSource['sourceType']>('hold');
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<MatchMode>('friendly');
  const [discipline, setDiscipline] = useState<MatchDiscipline>('singles');
  const [ratio, setRatio] = useState<MatchRatio>('5:5');
  const [format, setFormat] = useState<MatchFormat>('bo3');
  const [skillMin, setSkillMin] = useState<SkillTier>('intermediate');
  const [skillMax, setSkillMax] = useState<SkillTier>('intermediate_plus');
  const [preview, setPreview] = useState<MatchFundingPreview | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [passport, setPassport] = useState<OwnPassport | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getMyMatchSources()
      .then((result) => setSources(result.sources ?? []))
      .catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Không thể tải slot và booking của bạn.'));
    // Không tải được thì bỏ qua cảnh báo; backend vẫn chặn kèo xếp hạng khi chưa khai trình độ.
    void getOwnPassport().then(setPassport).catch(() => undefined);
  }, []);
  const visible = useMemo(() => (sources ?? []).filter((source) => source.sourceType === sourceType), [sources, sourceType]);
  const source = visible.find((item) => sourceKey(item) === selected) ?? visible[0];
  const bo5Allowed = allowsBo5(source);
  const disciplineName = discipline === 'singles' ? 'đánh đơn' : 'đánh đôi';
  const needsDeclaration = mode === 'ranked' && passport !== null && passport[discipline] === null;
  useEffect(() => { if (!bo5Allowed) setFormat('bo3'); }, [bo5Allowed]);
  useEffect(() => {
    setPreview(null);
    if (!source) return;
    let active = true;
    void getFundingPreview({ price: source.price, ratio, discipline, sourceType: source.sourceType })
      .then((next) => { if (active) setPreview(next); })
      .catch(() => { if (active) setPreview(null); });
    return () => { active = false; };
  }, [source?.price, source?.sourceType, ratio, discipline]);

  const submit = async () => {
    const problems: string[] = [];
    if (!source) problems.push('Hãy chọn một slot đang giữ hoặc booking đã thanh toán.');
    if (tiers.indexOf(skillMin) > tiers.indexOf(skillMax)) problems.push('Bậc tối thiểu không được cao hơn bậc tối đa.');
    if (needsDeclaration) problems.push(`Hãy khai trình độ ${disciplineName} trước khi tạo kèo xếp hạng ${disciplineName}.`);
    setErrors(problems);
    if (problems.length > 0 || !source) { summaryRef.current?.focus(); return; }
    setSubmitting(true);
    try {
      const config = { mode, discipline, ratio, format, skillMin, skillMax };
      const match = await createMatch(source.sourceType === 'hold' ? { holdId: source.holdId!, ...config } : { bookingId: source.bookingId!, ...config });
      onCreated(match);
    } catch (cause) {
      setErrors([cause instanceof Error ? cause.message : 'Không thể công bố kèo.']);
      summaryRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  if (loadError) return <RouteState variant="error" title="Không thể mở màn tạo kèo" description={loadError} onRetry={onCancel} />;
  if (!sources) return <RouteState variant="loading" title="Đang tải slot và booking của bạn" />;
  const paid = source?.sourceType === 'paid_booking';

  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-5">
        {errors.length > 0 && (
          <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-xl border border-danger bg-danger-bg p-4 text-sm text-danger">
            <p className="font-semibold">Chưa công bố được kèo</p>
            <ul className="mt-1 list-disc pl-5">{errors.map((message) => <li key={message}>{message}</li>)}</ul>
          </div>
        )}
        <SurfaceCard>
          <h2 className="text-h3">1. Chọn nguồn booking</h2>
          <p className="text-sm text-ink-500">Chỉ hiển thị slot hoặc booking hợp lệ của bạn.</p>
          <div className="mt-4">
            <ChoiceGroup
              legend="Loại nguồn"
              value={sourceType}
              onChange={(next) => { setSourceType(next); setSelected(''); }}
              options={[
                { value: 'hold', title: 'Slot đang giữ', description: 'Chưa thanh toán booking - cần hoàn tất phần tiền kèo.' },
                { value: 'paid_booking', title: 'Booking đã thanh toán', description: 'Dùng khoản tiền sân đã trả - không thanh toán tiền sân lần hai.' },
              ]}
            />
          </div>
          {visible.length === 0 ? (
            <p className="mt-4 rounded-xl bg-canvas p-3 text-sm text-ink-600">
              {sourceType === 'hold' ? 'Bạn chưa giữ slot nào còn ít nhất 24 giờ.' : 'Bạn chưa có booking đã thanh toán còn ít nhất 24 giờ.'}
            </p>
          ) : (
            <label className="mt-4 block text-sm font-medium">
              Sân và khung giờ
              <SelectInput aria-label="Nguồn tạo kèo" className="mt-1" value={source ? sourceKey(source) : ''} onChange={(event) => setSelected(event.target.value)}>
                {visible.map((item) => (
                  <option key={sourceKey(item)} value={sourceKey(item)}>
                    {item.venue.name} - {item.court.name} - {formatDateTimeVi(item.startAt)}
                  </option>
                ))}
              </SelectInput>
            </label>
          )}
          {source && (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-3">
              <div>
                <p className="font-semibold text-ink-900">{source.court.name} - {source.venue.name}</p>
                <p className="text-xs text-ink-500">{formatDateTimeVi(source.startAt)} - {source.venue.address}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-500">{paid ? 'Tiền sân đã trả' : 'Giá sân'}</p>
                <p className="text-figures font-bold text-brand-navy">{formatMoneyVnd(source.price)}</p>
              </div>
            </div>
          )}
          {source?.holdExpiresAt && (
            <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-sm text-ink-700">
              Slot được giữ đến {formatDateTimeVi(source.holdExpiresAt)}. Hãy công bố kèo và đóng phần góp trước giờ này, nếu không slot sẽ tự nhả.
            </p>
          )}
          {paid && (
            <p className="mt-3 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-sm text-ink-700">
              Booking thường vẫn giữ nguyên. Khi công bố, booking này trở thành nguồn của kèo; hệ thống không thu hay ghi nhận tiền sân lần hai.
            </p>
          )}
        </SurfaceCard>
        <SurfaceCard>
          <h2 className="text-h3">2. Cấu hình kèo</h2>
          <p className="text-sm text-ink-500">Các lựa chọn này bị khóa sau khi công bố.</p>
          <div className="mt-4 space-y-5">
            <ChoiceGroup legend="Chế độ" value={mode} onChange={setMode} options={[
              { value: 'friendly', title: 'Giao lưu', description: 'Có tiền kèo và xử lý kết quả; không cập nhật điểm xếp hạng.' },
              { value: 'ranked', title: 'Xếp hạng', description: 'Kết quả hợp lệ cập nhật điểm và bảng xếp hạng.' },
            ]} />
            <ChoiceGroup legend="Hình thức" value={discipline} onChange={setDiscipline} options={[
              { value: 'singles', title: 'Đánh đơn', description: '2 người - 1 người mỗi đội.' },
              { value: 'doubles', title: 'Đánh đôi', description: '4 người - 2 người mỗi đội.' },
            ]} />
            {needsDeclaration && (
              <p className="rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-sm text-ink-700">
                Kèo xếp hạng chỉ tính điểm cho người đã khai trình độ. Bạn chưa khai trình độ {disciplineName}.{' '}
                <Link to="/passport" className="font-semibold text-brand-navy underline">Khai trình độ ngay</Link>
              </p>
            )}
            <ChoiceGroup legend="Tỷ lệ bên thua : bên thắng" columns={3} value={ratio} onChange={setRatio}
              options={(Object.keys(ratioLabels) as MatchRatio[]).map((value) => ({ value, title: value.replace(':', ' : '), description: ratioLabels[value] }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-bold text-ink-900">Trình độ phù hợp</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <SelectInput aria-label="Bậc tối thiểu" value={skillMin} onChange={(event) => setSkillMin(event.target.value as SkillTier)}>
                    {tiers.map((tier) => <option key={tier} value={tier}>{tierLabels[tier]}</option>)}
                  </SelectInput>
                  <SelectInput aria-label="Bậc tối đa" value={skillMax} onChange={(event) => setSkillMax(event.target.value as SkillTier)}>
                    {tiers.map((tier) => <option key={tier} value={tier}>{tierLabels[tier]}</option>)}
                  </SelectInput>
                </div>
              </fieldset>
              <label className="block text-sm font-bold text-ink-900">
                Thể thức chính thức
                <SelectInput aria-describedby="format-hint" className="mt-2 font-normal" value={format} onChange={(event) => setFormat(event.target.value as MatchFormat)}>
                  <option value="bo3">BO3 - 21 điểm - giới hạn 30</option>
                  <option value="bo5" disabled={!bo5Allowed}>BO5 - 21 điểm - giới hạn 30</option>
                </SelectInput>
                <span id="format-hint" className="mt-1 block text-xs font-normal text-ink-500">
                  {bo5Allowed ? 'Booking trên 90 phút nên được chọn BO3 hoặc BO5.' : 'Booking từ 90 phút trở xuống chỉ áp dụng BO3.'}
                </span>
              </label>
            </div>
          </div>
        </SurfaceCard>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <div className="bg-brand-navy p-4 text-surface">
            <p className="font-semibold">{paid ? 'Booking thường - đã thanh toán' : 'Slot đang giữ - chưa thanh toán'}</p>
            <p className="mt-1 text-sm opacity-90">
              {paid ? 'Sau khi công bố: kèo chờ người chơi và chờ hạn chốt kèo. Tiền sân không bị thu lần hai.' : 'Sau khi công bố: bạn đóng phần của mình để mở kèo tìm người chơi.'}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-h3">Tiền của bạn</h2>
              <Badge tone="warning">{`Thua : thắng ${ratio}`}</Badge>
            </div>
            {!preview ? (
              <p className="mt-3 text-sm text-ink-500">{source ? 'Đang tính dòng tiền…' : 'Chọn nguồn booking để xem dòng tiền.'}</p>
            ) : (
              <>
                <MoneyRow label="Cần trả thêm khi tạo" hint={paid ? 'Booking đã thanh toán đủ' : 'Phần góp của chủ kèo'} value={preview.additionalOwnerCharge} />
                {paid && <MoneyRow label="Tiền sân đã thanh toán" hint="Không ghi nhận lần hai" value={preview.alreadyPaid} />}
                {paid && <MoneyRow label="Dự kiến hoàn khi chốt kèo" hint="Khi đủ người và đủ phần tiền kèo" value={preview.organizerRefundAtLock} badge={<Badge tone="success">Có thể rút</Badge>} />}
                <MoneyRow label="Giữ chờ kết quả" hint="Khoản chênh lệch toàn kèo sau khi chốt" value={preview.resultHeldAmount} badge={<Badge tone="warning">Đang giữ</Badge>} />
                <div className="mt-3 rounded-xl bg-canvas p-3">
                  <p className="text-sm font-semibold text-ink-700">Chi phí ròng sau kết quả</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-surface p-2"><p className="text-xs text-ink-500">Nếu bạn thắng</p><p className="text-figures font-bold">{formatMoneyVnd(preview.netCostIfWin)}</p></div>
                    <div className="rounded-lg bg-surface p-2"><p className="text-xs text-ink-500">Nếu bạn thua</p><p className="text-figures font-bold">{formatMoneyVnd(preview.netCostIfLose)}</p></div>
                  </div>
                </div>
              </>
            )}
            <p className="mt-3 text-xs text-ink-500">Các khoản hoàn/giữ chỉ phát sinh khi kèo được chốt hợp lệ. Trước hạn chốt kèo, người tham gia được rút và nhận lại 100% phần tiền đã đóng.</p>
            <Button className="mt-4 w-full" disabled={submitting || !source} onClick={() => void submit()}>{submitting ? 'Đang công bố…' : 'Công bố kèo'}</Button>
            <Button tone="secondary" className="mt-2 w-full" onClick={onCancel}>Quay lại</Button>
            <p className="mt-2 text-center text-xs text-ink-500">Khi công bố, chế độ, hình thức, tỷ lệ, trình độ và thể thức sẽ bị khóa.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}
