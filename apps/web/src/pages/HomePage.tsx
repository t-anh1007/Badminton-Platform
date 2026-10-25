import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { demoLogin } from '../lib/accountApi';
import { listMatches, type MatchRow } from '../lib/matchApi';
import { useSession } from '../session/SessionProvider';
import { Button, TextInput } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { MatchCard } from '../components/MatchCard';
import { VenueListPage } from './VenueListPage';

const steps: [IconName, string, string][] = [
  ['calendar', 'Đặt sân rõ lịch', 'Xem giờ trống, giữ chỗ 10 phút và chốt sân trong một hành trình.'],
  ['users', 'Tìm đúng người chơi', 'Vào kèo đúng bậc trình độ, hoặc tạo kèo từ sân bạn đã giữ.'],
  ['trophy', 'Kết nối sau trận', 'Ghi kết quả, leo bảng xếp hạng mùa và chia sẻ cùng cộng đồng.'],
];
const faq = [['Tôi giữ sân được bao lâu?', 'Một khung giờ được giữ trong 10 phút. Hết thời gian, khung giờ tự mở lại cho người khác.'], ['Hủy sân có được hoàn tiền không?', 'Từ 24 giờ trước giờ bắt đầu hoàn 100%; từ 6 đến dưới 24 giờ hoàn 50%; dưới 6 giờ không hoàn.'], ['Tôi có thể tìm kèo ở đâu?', 'Bạn sẽ thấy các kèo công khai phù hợp trong mục Tìm kèo.'], ['Tôi thanh toán bằng cách nào?', 'Bạn có thể dùng số dư nội bộ hoặc tạo mã chuyển khoản SePay ở bước thanh toán.']] as const;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

export function HomePage() {
  const { session, establish } = useSession();
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState('18:00');
  const [to, setTo] = useState('20:00');
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    void listMatches().then((result) => setMatches(result.matches.filter((match) => match.openSlots > 0).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 3))).catch(() => undefined);
  }, []);

  const startDemo = async () => {
    setDemoError('');
    setDemoLoading(true);
    try {
      establish(await demoLogin());
      navigate('/profile');
    } catch {
      setDemoError('Chưa vào được chế độ dùng thử. Hãy thử lại.');
    } finally {
      setDemoLoading(false);
    }
  };
  // Trang chủ của quản trị viên và chủ sân là trang Tài chính.
  if (session?.activeRole === 'admin') return <Navigate to="/admin" replace />;
  if (session?.activeRole === 'provider') return <Navigate to="/manage" replace />;
  return (
    <main>
      <section className="relative overflow-hidden bg-brand-navy text-surface">
        <div aria-hidden className="absolute -right-32 -top-32 h-[32rem] w-[32rem] rounded-full border-[60px] border-brand-yellow/[0.07]" />
        <div className="page-container relative grid gap-12 py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-20">
          <div>
            <p className="text-caption !text-brand-yellow">Nền tảng cầu lông toàn diện</p>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,5vw,4rem)] font-extrabold leading-[.98] tracking-[-.05em]">MỘT NƠI,<br />TRỌN VẸN NHỊP CHƠI.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-surface/80">Đặt sân nhanh, tìm kèo đúng trình và kết nối với cộng đồng cầu lông quanh bạn.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/venues" className="inline-flex min-h-[52px] items-center gap-2 rounded-full bg-brand-yellow px-7 text-sm font-bold uppercase tracking-[.04em] text-brand-navy transition hover:-translate-y-px hover:bg-brand-yellow-hover">Tìm sân gần bạn<Icon name="arrowRight" className="h-4 w-4" /></Link>
              <Link to="/matches" className="inline-flex min-h-[52px] items-center rounded-full border border-surface/35 px-7 text-sm font-bold uppercase tracking-[.04em] text-surface transition hover:bg-surface/10">Xem kèo đang mở</Link>
            </div>
            {!session && <button type="button" onClick={() => void startDemo()} disabled={demoLoading} className="mt-6 inline-flex items-center gap-1.5 font-bold text-brand-yellow hover:underline disabled:opacity-60">{demoLoading ? 'Đang vào…' : 'Chưa có tài khoản? Dùng thử bằng tài khoản demo'}<Icon name="arrowRight" className="h-4 w-4" /></button>}
            {demoError && <p role="alert" className="mt-3 text-sm text-brand-yellow">{demoError}</p>}
          </div>
          <form className="rounded-[1.25rem] bg-surface p-7 text-ink-900 shadow-[0_24px_60px_rgb(0_0_0/22%)]" onSubmit={(event) => { event.preventDefault(); navigate(`/venues?${new URLSearchParams({ date, from, to })}`); }}>
            <h2 className="text-h3">Tìm sân trống</h2>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Ngày chơi<TextInput type="date" required min={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Từ<TextInput type="time" required value={from} onChange={(event) => setFrom(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm font-semibold text-ink-700">Đến<TextInput type="time" required value={to} onChange={(event) => setTo(event.target.value)} /></label>
              </div>
              <Button type="submit" size="lg" className="mt-1 w-full !bg-brand-navy !text-surface"><Icon name="search" className="h-4 w-4" />Tìm sân</Button>
            </div>
          </form>
        </div>
      </section>

      <VenueListPage embedded />

      {matches.length > 0 && (
        <section className="border-y border-line bg-surface py-14">
          <div className="page-container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="courtin-kicker">Cùng ra sân</p><h2 className="mt-1 text-h2">Kèo sắp diễn ra</h2></div>
              <Link to="/matches" className="inline-flex items-center gap-1.5 font-bold text-brand-navy hover:underline">Xem tất cả kèo<Icon name="arrowRight" className="h-4 w-4" /></Link>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
          </div>
        </section>
      )}

      <section className="page-container py-14">
        <p className="courtin-kicker">Cách hoạt động</p>
        <h2 className="mt-1 text-h2">Ba bước để ra sân</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {steps.map(([icon, title, body], index) => (
            <div key={title} className="surface-card p-6">
              <div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-full bg-green-50 text-brand-navy"><Icon name={icon} className="h-6 w-6" /></span><span className="text-figures rounded-full bg-brand-yellow px-2.5 py-0.5 text-sm font-semibold text-brand-navy">0{index + 1}</span></div>
              <p className="mt-4 text-h3">{title}</p>
              <p className="mt-2 text-sm leading-6 text-ink-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page-container pb-14">
        <p className="courtin-kicker">Thông tin cần biết</p>
        <h2 className="mt-1 text-h2">Câu hỏi thường gặp</h2>
        <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
          {faq.map(([question, answer]) => (
            <details key={question} className="group surface-card p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink-900">{question}<Icon name="chevronDown" className="h-5 w-5 text-brand-navy transition group-open:rotate-180" /></summary>
              <p className="mt-3 text-sm leading-6 text-ink-500">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="page-container pb-16">
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-brand-navy-raised px-8 py-8 text-surface sm:px-12">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-yellow/15 text-brand-yellow"><Icon name="building" className="h-6 w-6" /></span>
            <div><p className="text-h3 !text-surface">Bạn là chủ sân?</p><p className="mt-1 text-surface/75">Nhận đặt lịch, quản lý lịch và đối soát doanh thu ở một nơi.</p></div>
          </div>
          <Link to="/provider-onboarding" className="inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-6 text-sm font-bold uppercase tracking-[.04em] text-brand-navy hover:bg-brand-yellow-hover">Đăng ký hợp tác</Link>
        </div>
      </section>
    </main>
  );
}
