import { Card } from '../components/Card';
import { FinancePanel } from '../components/FinancePanel';
import { DisputePanel } from '../components/DisputePanel';
import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile, type ProfileResult } from '../lib/accountApi';
import { getMyWallets, type WalletRow } from '../lib/financeApi';
import { getMyBookingHistory, type BookingSummary } from '../lib/venueBookingApi';

function formatVnd(value: string | undefined) {
  return `${BigInt(value ?? '0').toLocaleString('vi-VN')}đ`;
}

export function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [history, setHistory] = useState<BookingSummary[]>([]);
  const [form, setForm] = useState({ displayName: '', phone: '', visibility: 'public' as 'public' | 'private' });
  const [message, setMessage] = useState('');
  useEffect(() => {
    Promise.all([getMyProfile(), getMyWallets(), getMyBookingHistory()]).then(([nextProfile, nextWallets, nextHistory]) => {
      setProfile(nextProfile);
      setWallets(nextWallets);
      setHistory(nextHistory);
      setForm({ displayName: nextProfile.playerProfile?.displayName ?? '', phone: nextProfile.phone ?? '', visibility: nextProfile.playerProfile?.visibility ?? 'public' });
    }).catch((error: Error) => setMessage(error.message));
  }, []);
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await updateMyProfile(form); setMessage('Đã cập nhật hồ sơ.');
      const next = await getMyProfile(); setProfile(next);
    } catch (error) { setMessage((error as Error).message); }
  };
  const personalWallet = wallets.find((wallet) => wallet.walletType === 'personal');
  const businessWallet = wallets.find((wallet) => wallet.walletType === 'business');
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-h2 mb-8">Hồ sơ cá nhân</h1>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Thông tin</h2>
          <p className="text-body font-medium">{profile?.playerProfile?.displayName ?? 'Người chơi'}</p>
          <p className="text-body text-ink-900/60">{profile?.email ?? 'Đăng nhập để xem hồ sơ'}</p>
        </Card>

        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Ví cá nhân</h2>
          <p className="text-figures text-2xl font-semibold text-green-700">{formatVnd(personalWallet?.available)}</p>
        </Card>

        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Ví kinh doanh</h2>
          <p className="text-figures text-2xl font-semibold text-green-700">{formatVnd(businessWallet?.available)}</p>
          {!businessWallet && <p className="text-body text-ink-900/50">Chưa là nhà cung cấp</p>}
        </Card>
      </div>

      <form onSubmit={saveProfile} className="mt-6 grid gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-3">
        <input aria-label="Tên hiển thị hồ sơ" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Tên hiển thị" required />
        <input aria-label="Số điện thoại hồ sơ" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Số điện thoại" />
        <select aria-label="Hiển thị hồ sơ" value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value as 'public' | 'private' })}><option value="public">Công khai</option><option value="private">Riêng tư</option></select>
        <button type="submit" className="w-fit rounded-full bg-green-600 px-4 py-2 text-surface">Lưu hồ sơ</button>
      </form>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}

      <h2 className="text-h2 mt-10 mb-4 text-xl">Lịch sử booking</h2>
      <div className="flex flex-col gap-3">
        {history.map((booking) => (
          <Card key={booking.id} className="flex items-center justify-between">
            <div>
              <p className="text-body font-medium">{booking.court?.venue?.name ?? 'Sân'} — {booking.court?.name ?? booking.courtId}</p>
              <p className="text-body text-ink-900/50">{new Date(booking.startAt).toLocaleString('vi-VN')}</p>
            </div>
            <div className="text-right">
              <p className="text-figures font-medium">{formatVnd(booking.priceSnapshot)}</p>
              <p className="text-caption">{booking.status}</p>
            </div>
          </Card>
        ))}
        {!history.length && <p className="text-body text-ink-900/50">Chưa có booking đã hoàn tất.</p>}
      </div>
      <DisputePanel />
      <FinancePanel />
    </div>
  );
}
