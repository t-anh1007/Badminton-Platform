import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookingCancellationPanel } from '../components/BookingCancellationPanel';
import { presentLedgerEntry } from '../lib/presenters';
import { DisputePanel } from '../components/DisputePanel';
import { Avatar, Button, EmptyState, Modal, SegmentedControl, SelectInput, SurfaceCard, Tabs, TextInput } from '../components/ui';
import { MetricCard } from '../components/courtin/MetricCard';
import { changePassword, getMyProfile, updateMyProfile, type ProfileResult } from '../lib/accountApi';
import { createTopupIntent, getMyWallets, getWalletLedger, type WalletLedgerEntry, type WalletRow } from '../lib/financeApi';
import { getMyBookingHistory, getMyUpcomingBookings, type BookingSummary } from '../lib/venueBookingApi';
import { RoleBadge } from '../components/RoleBadge';
import type { UserRole } from '../session/session';
import { RouteState } from '../components/RouteState.js';

type Tab = 'bookings' | 'wallet' | 'disputes';

const money = (value?: string) => `${BigInt(value ?? '0').toLocaleString('vi-VN')}đ`;

export function ProfilePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'bookings';
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [ledgerByWallet, setLedgerByWallet] = useState<Record<string, WalletLedgerEntry[]>>({});
  const [upcoming, setUpcoming] = useState<BookingSummary[]>([]);
  const [past, setPast] = useState<BookingSummary[]>([]);
  const [period, setPeriod] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');
  const [message, setMessage] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('100000');
  const [topupIntent, setTopupIntent] = useState<{ matchCode: string; amount: string } | null>(null);
  const [topupBaseline, setTopupBaseline] = useState('0');
  const [topupState, setTopupState] = useState<'idle' | 'pending' | 'completed' | 'timeout'>('idle');
  const [form, setForm] = useState({ displayName: '', avatarUrl: '', phone: '', visibility: 'public' as 'public' | 'private' });
  const [password, setPassword] = useState({ current: '', next: '' });

  const loadPage = useCallback(async () => {
    setPageLoading(true);
    setPageError('');
    try {
      const [nextProfile, nextWallets, nextUpcoming, nextPast] = await Promise.all([getMyProfile(), getMyWallets(), getMyUpcomingBookings(), getMyBookingHistory()]);
        setProfile(nextProfile);
        setWallets(nextWallets);
        setUpcoming(nextUpcoming);
        setPast(nextPast);
        setForm({
          displayName: nextProfile.playerProfile?.displayName ?? '',
          avatarUrl: nextProfile.playerProfile?.avatarUrl ?? '',
          phone: nextProfile.phone ?? '',
          visibility: nextProfile.playerProfile?.visibility ?? 'public',
        });
        const ledgers = await Promise.all(nextWallets.map(async (wallet) => [wallet.id, (await getWalletLedger(wallet.id)).entries] as const));
        setLedgerByWallet(Object.fromEntries(ledgers));
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : 'Không thể tải hồ sơ.');
    } finally {
      setPageLoading(false);
    }
  }, []);
  useEffect(() => { void loadPage(); }, [loadPage]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateMyProfile(form);
      setProfile(await getMyProfile());
      setEditOpen(false);
      setMessage('Đã cập nhật hồ sơ.');
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await changePassword({
        currentPassword: password.current,
        newPassword: password.next,
        currentRefreshToken: localStorage.getItem('refreshToken') ?? undefined,
      });
      setPasswordOpen(false);
      setPassword({ current: '', next: '' });
      setMessage('Đổi mật khẩu thành công.');
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  const createTopup = async () => {
    if (!/^\d+$/.test(topupAmount) || BigInt(topupAmount) < 1_000n) {
      setMessage('Số tiền nạp tối thiểu là 1.000đ.');
      return;
    }
    try {
      setTopupBaseline(wallets.find((wallet) => wallet.walletType === 'personal')?.available ?? '0');
      const intent = await createTopupIntent(topupAmount);
      setTopupIntent(intent);
      setTopupState('pending');
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  useEffect(() => {
    if (!topupIntent || topupState !== 'pending') return;
    let active = true;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const nextWallets = await getMyWallets();
        if (!active) return;
        const nextPersonal = nextWallets.find((wallet) => wallet.walletType === 'personal');
        if (nextPersonal && BigInt(nextPersonal.available) > BigInt(topupBaseline)) {
          setWallets(nextWallets);
          setTopupState('completed');
          setMessage('Đã ghi nhận tiền nạp vào ví.');
          return;
        }
      } catch {
        // Giữ trạng thái chờ; người dùng vẫn có thể đóng modal và kiểm tra ví sau.
      }
      if (attempts >= 20 && active) setTopupState('timeout');
    };
    const timer = window.setInterval(() => { void poll(); }, 1_500);
    return () => { active = false; window.clearInterval(timer); };
  }, [topupBaseline, topupIntent, topupState]);

  const copyTopupCode = async () => {
    if (!topupIntent) return;
    try {
      await navigator.clipboard.writeText(topupIntent.matchCode);
      setMessage('Đã sao chép nội dung chuyển khoản.');
    } catch {
      setMessage('Không thể sao chép tự động. Hãy chọn và sao chép mã hiển thị.');
    }
  };

  const reloadBookings = async () => {
    const [nextUpcoming, nextPast] = await Promise.all([getMyUpcomingBookings(), getMyBookingHistory()]);
    setUpcoming(nextUpcoming);
    setPast(nextPast);
  };

  const allBookings = [...upcoming, ...past];
  const cancelledBookings = allBookings.filter((booking) => booking.status === 'cancelled');
  const bookings = period === 'cancelled'
    ? cancelledBookings
    : (period === 'upcoming' ? upcoming : past).filter((booking) => booking.status !== 'cancelled');
  const personal = wallets.find((wallet) => wallet.walletType === 'personal');
  const ledgerEntries = wallets.flatMap((wallet) => (ledgerByWallet[wallet.id] ?? []).map((entry) => ({ ...entry, walletType: wallet.walletType }))).sort((left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime());

  if (pageLoading) return <main className="page-container py-8 sm:py-12"><RouteState variant="loading" title="Đang tải hồ sơ và giao dịch" /></main>;
  if (pageError) return <main className="page-container py-8 sm:py-12"><RouteState variant="error" title="Không thể tải hồ sơ" description={pageError} onRetry={() => void loadPage()} /></main>;

  return (
    <main className="page-container py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SurfaceCard>
            {profile?.playerProfile?.avatarUrl ? <img src={profile.playerProfile.avatarUrl} alt="Ảnh đại diện tài khoản" className="h-16 w-16 rounded-full object-cover" /> : <Avatar label={profile?.playerProfile?.displayName ?? 'N'} className="h-16 w-16 text-xl" />}
            <h1 className="mt-4 text-h2">Hồ sơ của tôi</h1>
            <p className="mt-1 text-sm text-ink-500">{profile?.email}</p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Vai trò tài khoản">{profile?.roles.filter((role): role is UserRole => role === 'player' || role === 'provider' || role === 'admin').map((role) => <RoleBadge key={role} role={role} />)}</div>
            <div className="mt-5 space-y-3 border-y border-line py-4 text-sm">
              <p><span className="text-ink-500">Số booking</span><strong className="float-right text-figures">{upcoming.length + past.length}</strong></p>
              <p><span className="text-ink-500">Trình độ</span><span className="float-right">Chưa cập nhật</span></p>
            </div>
            <Button tone="secondary" className="mt-5 w-full" onClick={() => setEditOpen(true)}>Cập nhật thông tin</Button>
            <Button tone="ghost" className="mt-2 w-full" onClick={() => setPasswordOpen(true)}>Đổi mật khẩu</Button>
          </SurfaceCard>
        </aside>

        <section>
          <Tabs
            tabs={[{ value: 'bookings', label: 'Đặt sân của tôi' }, { value: 'wallet', label: 'Ví' }, { value: 'disputes', label: 'Tranh chấp' }]}
            value={tab}
            onChange={(next) => setParams({ tab: next })}
          />
          {message && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}

          {tab === 'bookings' && (
            <div className="mt-6">
              <SegmentedControl options={[{ value: 'upcoming', label: 'Sắp tới' }, { value: 'past', label: 'Đã qua' }, { value: 'cancelled', label: 'Đã hủy' }]} value={period} onChange={(next) => setPeriod(next as 'upcoming' | 'past' | 'cancelled')} />
              <div className="mt-4">{bookings.length ? <BookingCancellationPanel bookings={bookings} cancellable={period === 'upcoming'} onChanged={reloadBookings} /> : <EmptyState title="Chưa có booking" description="Khi bạn đặt sân, lịch sử sẽ hiển thị tại đây." />}</div>
            </div>
          )}

          {tab === 'wallet' && (
            <div className="mt-6">
              <div className="grid gap-4 sm:grid-cols-2"><MetricCard label="Ví cá nhân" value={money(personal?.available)} /></div>
              <Button className="mt-4" onClick={() => { setTopupIntent(null); setTopupState('idle'); setTopupOpen(true); }}>Nạp tiền bằng SePay</Button>
              <SurfaceCard className="mt-6"><h2 className="text-h3">Giao dịch gần đây</h2>{ledgerEntries.length ? <ul className="mt-4 divide-y divide-line">{ledgerEntries.map((entry) => { const shown = presentLedgerEntry(entry); return <li key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-medium text-ink-900">{shown.title}</p><p className="mt-1 text-ink-500">{shown.subtitle || new Date(entry.ts).toLocaleString('vi-VN')}</p></div><strong className={`text-figures ${shown.amountTone === 'debit' ? 'text-danger' : 'text-green-700'}`}>{shown.amountTone === 'debit' ? '' : '+'}{money(entry.amount)}</strong></li>})}</ul> : <p className="mt-3 text-sm text-ink-500">Chưa có giao dịch.</p>}</SurfaceCard>
            </div>
          )}

          {tab === 'disputes' && <DisputePanel />}
        </section>
      </div>

      <Modal open={editOpen} title="Cập nhật thông tin" onClose={() => setEditOpen(false)}>
        <form onSubmit={save} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">Tên hiển thị<TextInput required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
          <label className="grid gap-1.5 text-sm font-medium">URL ảnh đại diện<TextInput type="url" value={form.avatarUrl} onChange={(event) => setForm({ ...form, avatarUrl: event.target.value })} placeholder="https://…" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Số điện thoại<TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Hiển thị<SelectInput value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as 'public' | 'private' })}><option value="public">Công khai</option><option value="private">Riêng tư</option></SelectInput></label>
          <Button type="submit">Lưu thay đổi</Button>
        </form>
      </Modal>

      <Modal open={passwordOpen} title="Đổi mật khẩu" onClose={() => setPasswordOpen(false)}>
        <form onSubmit={savePassword} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">Mật khẩu hiện tại<TextInput type="password" required value={password.current} onChange={(event) => setPassword({ ...password, current: event.target.value })} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Mật khẩu mới<TextInput type="password" required minLength={8} value={password.next} onChange={(event) => setPassword({ ...password, next: event.target.value })} /></label>
          <Button type="submit">Đổi mật khẩu</Button>
        </form>
      </Modal>

      <Modal open={topupOpen} title="Nạp tiền bằng SePay" onClose={() => setTopupOpen(false)}>
        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">Số tiền (VNĐ)<TextInput inputMode="numeric" min="1000" type="number" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} /></label>
          <Button onClick={() => void createTopup()}>Tạo mã chuyển khoản</Button>
          {topupIntent && <div role="status" aria-live="polite" className="rounded-xl bg-green-50 p-3 text-sm text-green-700"><p>Chuyển đúng <strong className="text-figures">{money(topupIntent.amount)}</strong> với nội dung:</p><p className="mt-2 flex flex-wrap items-center gap-2"><strong className="text-figures text-base">{topupIntent.matchCode}</strong><Button size="sm" tone="secondary" onClick={() => void copyTopupCode()}>Sao chép mã</Button></p><p className="mt-2">{topupState === 'pending' ? 'Đang chờ SePay xác nhận…' : topupState === 'completed' ? 'Đã nạp tiền thành công.' : topupState === 'timeout' ? 'Chưa thấy giao dịch. Bạn có thể kiểm tra lại ví sau.' : ''}</p></div>}
        </div>
      </Modal>
    </main>
  );
}
