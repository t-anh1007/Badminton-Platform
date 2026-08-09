import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookingCancellationPanel } from '../components/BookingCancellationPanel';
import { DisputePanel } from '../components/DisputePanel';
import { FinancePanel } from '../components/FinancePanel';
import { Avatar, Badge, Button, EmptyState, Modal, SegmentedControl, SelectInput, SurfaceCard, Tabs, TextInput } from '../components/ui';
import { changePassword, getMyProfile, updateMyProfile, type ProfileResult } from '../lib/accountApi';
import { createTopupIntent, getMyWallets, getWalletLedger, type WalletLedgerEntry, type WalletRow } from '../lib/financeApi';
import { getMyBookingHistory, getMyUpcomingBookings, type BookingSummary } from '../lib/venueBookingApi';

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
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('100000');
  const [topupIntent, setTopupIntent] = useState<{ matchCode: string; amount: string } | null>(null);
  const [form, setForm] = useState({ displayName: '', phone: '', visibility: 'public' as 'public' | 'private' });
  const [password, setPassword] = useState({ current: '', next: '' });

  useEffect(() => {
    Promise.all([getMyProfile(), getMyWallets(), getMyUpcomingBookings(), getMyBookingHistory()])
      .then(async ([nextProfile, nextWallets, nextUpcoming, nextPast]) => {
        setProfile(nextProfile);
        setWallets(nextWallets);
        setUpcoming(nextUpcoming);
        setPast(nextPast);
        setForm({
          displayName: nextProfile.playerProfile?.displayName ?? '',
          phone: nextProfile.phone ?? '',
          visibility: nextProfile.playerProfile?.visibility ?? 'public',
        });
        const ledgers = await Promise.all(nextWallets.map(async (wallet) => [wallet.id, (await getWalletLedger(wallet.id)).entries] as const));
        setLedgerByWallet(Object.fromEntries(ledgers));
      })
      .catch((caught: Error) => setMessage(caught.message));
  }, []);

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
    try {
      const intent = await createTopupIntent(topupAmount);
      setTopupIntent(intent);
    } catch (caught) {
      setMessage((caught as Error).message);
    }
  };

  const allBookings = [...upcoming, ...past];
  const cancelledBookings = allBookings.filter((booking) => booking.status === 'cancelled');
  const bookings = period === 'cancelled'
    ? cancelledBookings
    : (period === 'upcoming' ? upcoming : past).filter((booking) => booking.status !== 'cancelled');
  const personal = wallets.find((wallet) => wallet.walletType === 'personal');
  const business = wallets.find((wallet) => wallet.walletType === 'business');
  const ledgerEntries = wallets.flatMap((wallet) => (ledgerByWallet[wallet.id] ?? []).map((entry) => ({ ...entry, walletType: wallet.walletType }))).sort((left, right) => new Date(right.ts).getTime() - new Date(left.ts).getTime());

  return (
    <main className="page-container py-8 sm:py-12">
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <SurfaceCard>
            <Avatar label={profile?.playerProfile?.displayName ?? 'N'} className="h-16 w-16 text-xl" />
            <h1 className="mt-4 text-h2">Hồ sơ của tôi</h1>
            <p className="mt-1 text-sm text-ink-500">{profile?.email}</p>
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
              <SegmentedControl options={[{ value: 'upcoming', label: 'Sắp tới' }, { value: 'past', label: 'Đã qua' }, { value: 'cancelled', label: 'Đã hủy' }]} value={period} onChange={setPeriod} />
              <div className="mt-4 space-y-3">
                {bookings.length ? bookings.map((booking) => (
                  <SurfaceCard key={booking.id}>
                    <div className="flex justify-between gap-4">
                      <div><h2 className="text-h3">{booking.court?.venue?.name ?? 'Cơ sở sân'} · {booking.court?.name ?? booking.courtId}</h2><p className="mt-1 text-sm text-ink-500">{new Date(booking.startAt).toLocaleString('vi-VN')}</p></div>
                      <div className="text-right"><p className="text-figures font-semibold">{money(booking.priceSnapshot)}</p><Badge tone={booking.status === 'confirmed' ? 'success' : 'neutral'}>{booking.status}</Badge></div>
                    </div>
                  </SurfaceCard>
                )) : <EmptyState title="Chưa có booking" description="Khi bạn đặt sân, lịch sử sẽ hiển thị tại đây." />}
              </div>
              <BookingCancellationPanel />
            </div>
          )}

          {tab === 'wallet' && (
            <div className="mt-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <SurfaceCard><p className="text-caption">Ví cá nhân</p><p className="mt-2 text-figures text-3xl font-semibold">{money(personal?.available)}</p></SurfaceCard>
                {business && <SurfaceCard><p className="text-caption">Ví kinh doanh</p><p className="mt-2 text-figures text-3xl font-semibold">{money(business.available)}</p></SurfaceCard>}
              </div>
              <Button className="mt-4" onClick={() => { setTopupIntent(null); setTopupOpen(true); }}>Nạp tiền bằng SePay</Button>
              <SurfaceCard className="mt-6"><h2 className="text-h3">Giao dịch gần đây</h2>{ledgerEntries.length ? <ul className="mt-4 divide-y divide-line">{ledgerEntries.map((entry) => <li key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div><p className="font-medium text-ink-900">{entry.type} · {entry.walletType}</p><p className="mt-1 text-ink-500">{new Date(entry.ts).toLocaleString('vi-VN')}</p></div><strong className={`text-figures ${BigInt(entry.amount) < 0n ? 'text-danger' : 'text-green-700'}`}>{BigInt(entry.amount) < 0n ? '' : '+'}{money(entry.amount)}</strong></li>)}</ul> : <p className="mt-3 text-sm text-ink-500">Chưa có giao dịch.</p>}</SurfaceCard>
              <FinancePanel />
            </div>
          )}

          {tab === 'disputes' && <DisputePanel />}
        </section>
      </div>

      <Modal open={editOpen} title="Cập nhật thông tin" onClose={() => setEditOpen(false)}>
        <form onSubmit={save} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">Tên hiển thị<TextInput required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></label>
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
          {topupIntent && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">Chuyển đúng <strong className="text-figures">{money(topupIntent.amount)}</strong> với mã: <strong className="text-figures">{topupIntent.matchCode}</strong></p>}
        </div>
      </Modal>
    </main>
  );
}
