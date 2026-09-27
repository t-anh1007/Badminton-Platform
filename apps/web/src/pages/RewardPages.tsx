import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AsyncButton, Badge, SelectInput, SurfaceCard, TextInput } from '../components/ui';
import { RouteState } from '../components/RouteState.js';
import { PageHeader } from '../components/courtin/PageHeader';
import { useServerCountdown } from '../components/MatchResultFlow';
import { formatDateTimeVi, formatDateVi, formatMoneyVnd } from '../lib/formatters.js';
import { getMyProfile } from '../lib/accountApi';
import {
  getMyRewardPayout, getRewardProgram, listMyRewardPayouts, listRewardPrograms, submitPayoutInformation,
  PAYOUT_STATUS_LABELS, REWARD_STATUS_LABELS,
  type PayoutInformation, type RewardPayout, type RewardProgram,
} from '../lib/rewardApi';
import { provinceName } from './PassportPage';

const scoreUnit: Record<RewardProgram['criterion'], string> = {
  ending_rating: 'điểm xếp hạng',
  most_wins: 'trận thắng',
  largest_rating_gain: 'điểm tăng trong kỳ',
  longest_streak: 'trận thắng liên tiếp',
};
const rankName = (rank: number) => ({ 1: 'Hạng nhất', 2: 'Hạng nhì', 3: 'Hạng ba' } as Record<number, string>)[rank] ?? `Hạng ${rank}`;
const programScope = (program: RewardProgram) =>
  [program.discipline === 'singles' ? 'Đánh đơn' : 'Đánh đôi', program.band === 'under_1600' ? 'Dưới 1.600' : 'Từ 1.600'].join(' · ');
const programArea = (program: RewardProgram) => (program.scope === 'province' ? provinceName(program.provinceCode) ?? 'Tỉnh/thành' : 'Toàn nền tảng');
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error ? cause.message : fallback);

export function RewardProgramsPage() {
  const [programs, setPrograms] = useState<RewardProgram[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { listRewardPrograms().then((result) => setPrograms(result.items), (cause) => setError(errorText(cause, 'Không thể tải chương trình thưởng.'))); }, []);
  return (
    <div className="page-container py-8 sm:py-10">
      <PageHeader eyebrow="Bảng xếp hạng" title="Chương trình thưởng" description="Giải thưởng do Admin, ngân sách marketing hoặc nhà tài trợ chi trả; không lấy từ tiền booking hay tiền kèo." />
      <div className="mt-6">
        {error ? <RouteState variant="error" title="Chưa thể tải chương trình" description={error} />
          : !programs ? <RouteState variant="loading" title="Đang tải chương trình thưởng" />
          : programs.length === 0 ? <RouteState variant="empty" title="Chưa có chương trình thưởng" description="Chương trình mới sẽ xuất hiện khi Admin công bố." />
          : (
            <div className="grid gap-4 md:grid-cols-2">
              {programs.map((program) => (
                <Link key={program.id} to={`/rewards/${program.id}`} className="block">
                  <SurfaceCard hoverable className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-h3">{program.name}</h2>
                      <Badge tone={program.status === 'active' ? 'success' : program.status === 'cancelled' ? 'danger' : 'neutral'}>{REWARD_STATUS_LABELS[program.status]}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-ink-500">{programScope(program)} · {programArea(program)}</p>
                    <p className="mt-1 text-sm text-ink-500">{formatDateVi(program.startAt)} - {formatDateVi(program.endAt)} · {program.criterionLabel}</p>
                    {program.tiers[0] && <p className="text-figures mt-3 font-bold text-brand-navy">Giải nhất {formatMoneyVnd(program.tiers[0].amount)}</p>}
                  </SurfaceCard>
                </Link>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export function RewardProgramDetailPage() {
  const { programId } = useParams();
  const [program, setProgram] = useState<RewardProgram | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    getRewardProgram(programId!).then((result) => setProgram(result.program), (cause) => setError(errorText(cause, 'Không thể tải chương trình thưởng.')));
  }, [programId]);
  useEffect(load, [load]);
  const deadline = program?.status === 'scheduled' ? program.startAt : program?.status === 'active' ? program.endAt : null;
  const countdown = useServerCountdown(program?.serverNow, deadline, load);

  if (error) return <div className="page-container py-8"><RouteState variant="error" title="Chưa thể mở chương trình" description={error} /></div>;
  if (!program) return <div className="page-container py-8"><RouteState variant="loading" title="Đang tải chương trình thưởng" /></div>;
  const signedIn = Boolean(window.localStorage.getItem('accessToken'));
  return (
    <div className="page-container py-8 sm:py-10">
      <nav className="text-sm text-ink-500" aria-label="Đường dẫn"><Link to="/leaderboard" className="font-semibold text-brand-navy">Bảng xếp hạng</Link> / <Link to="/rewards" className="hover:underline">Chương trình thưởng</Link> / {program.name}</nav>
      <section className="mt-4 flex flex-col gap-4 rounded-3xl bg-brand-navy p-6 text-surface sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <p className="text-xs font-bold text-brand-yellow">{REWARD_STATUS_LABELS[program.status]}</p>
          <h1 className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">{program.name}</h1>
          <p className="mt-2 text-sm text-surface/80">Tiêu chí xét giải: {program.criterionLabel.toLowerCase()}.</p>
        </div>
        {countdown && (
          <div className="sm:text-right">
            <p className="text-xs text-surface/75">{program.status === 'scheduled' ? 'Bắt đầu sau' : 'Thời gian còn lại'}</p>
            <p className="text-figures text-3xl font-bold text-brand-yellow">{countdown}</p>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <SurfaceCard>
          <h2 className="text-h2">Thông tin chương trình</h2>
          <p className="mt-1 text-sm text-ink-500">Áp dụng tự động cho người chơi đáp ứng điều kiện của bảng.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {[['Thời gian', `${formatDateVi(program.startAt)} - ${formatDateVi(program.endAt)}`], ['Nội dung và nhóm điểm', programScope(program)], ['Phạm vi', programArea(program)]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-line p-3"><dt className="text-xs text-ink-500">{label}</dt><dd className="mt-1 font-semibold text-brand-navy">{value}</dd></div>
            ))}
          </dl>
          <h2 className="text-h2 mt-6">Cơ cấu giải thưởng</h2>
          <p className="mt-1 text-sm text-ink-500">Tiền thưởng được công bố trước và không giảm trong thời gian chương trình.</p>
          <ul className="mt-3 divide-y divide-line">
            {program.tiers.map((tier) => (
              <li key={tier.rank} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`grid h-10 w-10 place-items-center rounded-full font-bold ${tier.rank === 1 ? 'bg-brand-yellow text-brand-navy' : 'bg-canvas text-brand-navy'}`}>{tier.rank}</span>
                  <div><p className="font-semibold">{rankName(tier.rank)}</p><p className="text-xs text-ink-500">Vị trí số {tier.rank} khi chốt kết quả</p></div>
                </div>
                <p className="text-figures font-bold text-brand-navy">{formatMoneyVnd(tier.amount)}</p>
              </li>
            ))}
          </ul>
          <h2 className="text-h2 mt-6">Cách xác định người nhận giải</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {[
              ['Hệ thống tự tính thứ hạng', `Xếp theo tiêu chí: ${program.criterionLabel.toLowerCase()}.`],
              ['Chờ các trận đúng hạn hoàn tất xử lý', 'Trận kết thúc trong thời gian chương trình vẫn được tính sau khi có kết quả cuối cùng.'],
              ['Admin duyệt danh sách cuối', 'Admin chỉ duyệt danh sách do hệ thống tính, không sửa điểm hoặc thứ hạng.'],
              ['Đồng hạng được chia đều', 'Tiền của các vị trí đồng hạng được cộng lại và chia đều cho những người cùng hạng.'],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold">{index + 1}</span>
                <div><p className="font-semibold text-brand-navy">{title}</p><p className="text-xs text-ink-500">{body}</p></div>
              </li>
            ))}
          </ol>
        </SurfaceCard>

        <SurfaceCard className="h-fit">
          <h2 className="text-h2">Vị trí hiện tại của bạn</h2>
          <p className="mt-1 text-sm text-ink-500">{programScope(program)} · {programArea(program)}</p>
          {!signedIn ? (
            <p className="mt-4 rounded-xl bg-canvas p-4 text-sm">Đăng nhập để xem thứ hạng tạm tính của bạn.</p>
          ) : program.viewer ? (
            <div className="mt-4 rounded-2xl bg-canvas p-5">
              <p className="text-xs text-ink-500">{program.status === 'final' ? 'Hạng chính thức' : 'Hạng tạm tính'}</p>
              <p className="text-figures text-4xl font-bold text-brand-navy">#{program.viewer.rank}</p>
              <p className="mt-1 text-sm text-success">{program.viewer.score.toLocaleString('vi-VN')} {scoreUnit[program.criterion]}</p>
              {program.status === 'final' && program.tiers.some((tier) => tier.rank === program.viewer!.rank) && (
                <Link to="/rewards/payouts" className="mt-3 inline-block text-sm font-bold text-brand-navy underline">Xem khoản thưởng và bổ sung thông tin nhận thưởng</Link>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-canvas p-4 text-sm">
              {program.status === 'scheduled' ? 'Chương trình chưa bắt đầu.' : 'Bạn chưa có trong danh sách của chương trình này. Chơi kèo xếp hạng đúng nội dung, nhóm điểm và khu vực để được tính.'}
            </p>
          )}
          {program.status !== 'final' && program.status !== 'cancelled' && (
            <p className="mt-4 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">Thứ hạng có thể thay đổi đến khi chương trình kết thúc và các kết quả liên quan được xử lý xong.</p>
          )}
          <p className="mt-3 rounded-xl bg-success-bg p-3 text-xs text-ink-700">Giải thưởng do Admin, ngân sách marketing hoặc nhà tài trợ chi trả; không lấy từ tiền booking hoặc tiền kèo của người chơi.</p>
          <Link to="/leaderboard" className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line font-bold text-brand-navy hover:bg-canvas">Quay lại bảng xếp hạng</Link>
        </SurfaceCard>
      </div>
    </div>
  );
}

export function RewardPayoutsPage() {
  const { payoutId } = useParams();
  const navigate = useNavigate();
  useEffect(() => { if (!window.localStorage.getItem('accessToken')) navigate('/auth'); }, [navigate]);
  return payoutId ? <RewardPayoutDetail payoutId={payoutId} /> : <RewardPayoutList />;
}

function payoutTone(status: RewardPayout['status']) {
  return status === 'paid' ? 'success' as const : status === 'cancelled' ? 'danger' as const : 'warning' as const;
}

function RewardPayoutList() {
  const [items, setItems] = useState<RewardPayout[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { listMyRewardPayouts().then((result) => setItems(result.items), (cause) => setError(errorText(cause, 'Không thể tải giải thưởng.'))); }, []);
  return (
    <div className="page-container py-8 sm:py-10">
      <PageHeader eyebrow="Giải thưởng" title="Giải thưởng của tôi" description="Bổ sung thông tin nhận thưởng trong 7 ngày kể từ khi được thông báo." />
      <div className="mt-6">
        {error ? <RouteState variant="error" title="Chưa thể tải giải thưởng" description={error} />
          : !items ? <RouteState variant="loading" title="Đang tải giải thưởng" />
          : items.length === 0 ? <RouteState variant="empty" title="Chưa có giải thưởng" description="Khi bạn đạt giải trong một chương trình thưởng, khoản thưởng sẽ xuất hiện ở đây." action={<Link to="/rewards" className="font-bold text-brand-navy underline">Xem chương trình thưởng</Link>} />
          : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id}>
                  <Link to={`/rewards/payouts/${item.id}`} className="block">
                    <SurfaceCard hoverable>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div><p className="font-semibold text-brand-navy">{item.programName}</p><p className="text-sm text-ink-500">{item.achievementLabel}</p></div>
                        <div className="flex items-center gap-3"><span className="text-figures font-bold">{formatMoneyVnd(item.amount)}</span><Badge tone={payoutTone(item.status)}>{PAYOUT_STATUS_LABELS[item.status]}</Badge></div>
                      </div>
                    </SurfaceCard>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  );
}

export const BANKS = [
  ['VCB', 'Vietcombank'], ['CTG', 'VietinBank'], ['BIDV', 'BIDV'], ['VBA', 'Agribank'], ['TCB', 'Techcombank'], ['MB', 'MB Bank'],
  ['ACB', 'ACB'], ['VPB', 'VPBank'], ['TPB', 'TPBank'], ['STB', 'Sacombank'], ['VIB', 'VIB'], ['SHB', 'SHB'], ['HDB', 'HDBank'], ['OCB', 'OCB'], ['MSB', 'MSB'],
] as const;
const EMPTY_FORM: PayoutInformation = { recipientName: '', email: '', phone: '', address: '', bankCode: '', bankAccountNumber: '', bankAccountName: '' };
type FormErrors = Partial<Record<keyof PayoutInformation, string>>;

function validate(form: PayoutInformation): FormErrors {
  const errors: FormErrors = {};
  if (!form.recipientName.trim()) errors.recipientName = 'Nhập họ và tên người nhận.';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Email chưa đúng định dạng.';
  if (!/^\+?\d{9,15}$/.test(form.phone.replace(/[\s.]/g, ''))) errors.phone = 'Số điện thoại gồm 9-15 chữ số.';
  if (!form.address.trim()) errors.address = 'Nhập địa chỉ liên hệ.';
  if (!form.bankCode) errors.bankCode = 'Chọn ngân hàng.';
  if (!/^\d{6,30}$/.test(form.bankAccountNumber.replace(/\s/g, ''))) errors.bankAccountNumber = 'Số tài khoản gồm 6-30 chữ số.';
  if (!form.bankAccountName.trim()) errors.bankAccountName = 'Nhập tên chủ tài khoản.';
  return errors;
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function RewardPayoutDetail({ payoutId }: { payoutId: string }) {
  const [payout, setPayout] = useState<RewardPayout | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<PayoutInformation>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(() => {
    getMyRewardPayout(payoutId).then((result) => setPayout(result.payout), (cause) => setError(errorText(cause, 'Không thể tải khoản thưởng.')));
  }, [payoutId]);
  useEffect(load, [load]);
  useEffect(() => {
    // Điền sẵn thông tin đã có trong hồ sơ để không phải nhập lại.
    getMyProfile().then((profile) => setForm((prev) => ({
      ...prev,
      recipientName: prev.recipientName || profile.playerProfile?.displayName || '',
      email: prev.email || profile.email,
      phone: prev.phone || profile.phone || '',
    })), () => undefined);
  }, []);
  const deadline = payout?.status === 'awaiting_information' ? payout.claimDeadlineAt : payout?.status === 'ready_to_pay' ? payout.payoutDeadlineAt : null;
  const countdown = useServerCountdown(payout?.serverNow, deadline, load);

  if (error) return <div className="page-container py-8"><RouteState variant="error" title="Chưa thể mở khoản thưởng" description={error} /></div>;
  if (!payout) return <div className="page-container py-8"><RouteState variant="loading" title="Đang tải khoản thưởng" /></div>;
  const editable = (payout.status === 'awaiting_information' && countdown !== '00:00:00') || payout.status === 'ready_to_pay';
  const set = (key: keyof PayoutInformation) => (event: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const fieldProps = (key: keyof PayoutInformation) => ({
    id: `payout-${key}`, value: form[key], onChange: set(key), disabled: !editable,
    'aria-invalid': errors[key] ? true : undefined, 'aria-describedby': errors[key] ? `payout-${key}-error` : undefined,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    setNotice('');
    try {
      const result = await submitPayoutInformation(payout.id, {
        ...form, phone: form.phone.replace(/[\s.]/g, ''), bankAccountNumber: form.bankAccountNumber.replace(/\s/g, ''),
        recipientName: form.recipientName.trim(), email: form.email.trim(), address: form.address.trim(), bankAccountName: form.bankAccountName.trim(),
      });
      setPayout((prev) => ({ ...prev!, ...result.payout }));
      setNotice('Đã lưu thông tin nhận thưởng. Admin sẽ chuyển thưởng trong 7 ngày.');
    } catch (cause) {
      setNotice(errorText(cause, 'Không thể lưu thông tin nhận thưởng.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-container py-8 sm:py-10">
      <nav className="text-sm text-ink-500" aria-label="Đường dẫn"><Link to="/rewards/payouts" className="font-semibold text-brand-navy">Giải thưởng của tôi</Link> / Thông tin nhận thưởng</nav>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-brand-navy sm:text-4xl">Hoàn tất thông tin nhận thưởng</h1>
          <p className="mt-1 text-sm text-ink-500">Cung cấp thông tin liên hệ và tài khoản ngân hàng để Admin chuyển thưởng.</p>
        </div>
        <Badge tone={payoutTone(payout.status)}>{PAYOUT_STATUS_LABELS[payout.status]}</Badge>
      </div>
      <section className="mt-5 grid gap-4 rounded-2xl bg-brand-navy p-5 text-surface sm:grid-cols-3">
        <div><p className="text-xs text-surface/75">Chương trình</p><p className="font-semibold">{payout.programName}</p></div>
        <div><p className="text-xs text-surface/75">Thành tích</p><p className="font-semibold">{payout.achievementLabel}</p></div>
        <div><p className="text-xs text-surface/75">Số tiền thưởng</p><p className="text-figures text-2xl font-bold text-brand-yellow">{formatMoneyVnd(payout.amount)}</p></div>
      </section>

      {payout.status === 'paid' ? (
        <SurfaceCard className="mt-5">
          <h2 className="text-h2">Đã chuyển thưởng</h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            <div className="flex justify-between py-3"><dt>Thời điểm chuyển</dt><dd className="font-semibold">{payout.paidAt ? formatDateTimeVi(payout.paidAt) : '—'}</dd></div>
            <div className="flex justify-between py-3"><dt>Mã giao dịch</dt><dd className="font-semibold">{payout.transactionReference ?? '—'}</dd></div>
          </dl>
          {payout.proofUrl && <a href={payout.proofUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-bold text-brand-navy underline">Xem chứng từ chuyển khoản</a>}
        </SurfaceCard>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)} className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]">
          <SurfaceCard>
            <h2 className="text-h2">Thông tin người nhận</h2>
            <p className="mt-1 text-sm text-ink-500">Tất cả các trường đều bắt buộc để nhận thưởng.</p>
            {payout.status === 'ready_to_pay' && <p className="mt-3 rounded-xl bg-success-bg p-3 text-sm">Bạn đã gửi đủ thông tin. Gửi lại biểu mẫu nếu cần cập nhật trước khi Admin chuyển thưởng.</p>}
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="payout-recipientName" label="Họ và tên" error={errors.recipientName}><TextInput autoComplete="name" {...fieldProps('recipientName')} /></Field>
              <Field id="payout-email" label="Email" error={errors.email}><TextInput type="email" autoComplete="email" {...fieldProps('email')} /></Field>
              <Field id="payout-phone" label="Số điện thoại" error={errors.phone}><TextInput type="tel" autoComplete="tel" {...fieldProps('phone')} /></Field>
              <Field id="payout-address" label="Địa chỉ liên hệ" error={errors.address}><TextInput autoComplete="street-address" {...fieldProps('address')} /></Field>
            </div>
            <h2 className="text-h2 mt-6 border-t border-line pt-5">Thông tin tài khoản ngân hàng</h2>
            <p className="mt-1 text-sm text-ink-500">Tên chủ tài khoản cần khớp với tên người nhận thưởng.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="payout-bankCode" label="Ngân hàng" error={errors.bankCode}>
                <SelectInput {...fieldProps('bankCode')}>
                  <option value="">Chọn ngân hàng</option>
                  {BANKS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </SelectInput>
              </Field>
              <Field id="payout-bankAccountNumber" label="Số tài khoản" error={errors.bankAccountNumber}><TextInput inputMode="numeric" {...fieldProps('bankAccountNumber')} /></Field>
              <div className="sm:col-span-2">
                <Field id="payout-bankAccountName" label="Tên chủ tài khoản" error={errors.bankAccountName}><TextInput {...fieldProps('bankAccountName')} /></Field>
              </div>
            </div>
          </SurfaceCard>
          <SurfaceCard className="h-fit">
            <h2 className="text-h2">{payout.status === 'ready_to_pay' ? 'Hạn chuyển thưởng' : 'Thời hạn hoàn tất'}</h2>
            <p className="mt-1 text-sm text-ink-500">
              {payout.status === 'ready_to_pay' ? 'Admin chuyển thưởng trong 7 ngày kể từ khi bạn gửi đủ thông tin.' : 'Thời hạn tính từ lúc danh sách nhận giải được thông báo.'}
            </p>
            {deadline && (
              <div className="mt-4 rounded-xl bg-danger-bg p-4">
                <p className="text-xs font-bold text-danger">Còn lại</p>
                <p className="text-figures text-2xl font-bold text-danger">{countdown}</p>
                <p className="text-xs text-ink-500">Hết hạn lúc {formatDateTimeVi(deadline)}</p>
              </div>
            )}
            {payout.status === 'awaiting_information' && (
              <p className="mt-4 rounded-xl border-l-4 border-brand-yellow bg-warning-bg p-3 text-xs text-ink-700">
                Nếu quá thời hạn 7 ngày, bạn mất quyền nhận giải; phần thưởng bị hủy và không chuyển cho người xếp hạng tiếp theo.
              </p>
            )}
            <p className="mt-3 rounded-xl bg-canvas p-3 text-xs text-ink-700">Thông tin liên hệ và ngân hàng chỉ được dùng để Admin thực hiện việc trả thưởng.</p>
            {notice && <p role="status" className={`mt-3 text-sm ${notice.startsWith('Đã') ? 'text-success' : 'text-danger'}`}>{notice}</p>}
            {editable ? (
              <AsyncButton type="submit" className="mt-4 w-full" pending={pending}>Lưu thông tin nhận thưởng</AsyncButton>
            ) : (
              <p className="mt-4 text-sm text-ink-500">Khoản thưởng không còn nhận cập nhật thông tin.</p>
            )}
          </SurfaceCard>
        </form>
      )}
    </div>
  );
}
