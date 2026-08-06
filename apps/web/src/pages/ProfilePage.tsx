import { Card } from '../components/Card';
import { MOCK_BOOKING_HISTORY } from '../data/mock';
import { FinancePanel } from '../components/FinancePanel';
import { DisputePanel } from '../components/DisputePanel';

export function ProfilePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-h2 mb-8">Hồ sơ cá nhân</h1>

      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Thông tin</h2>
          <p className="text-body font-medium">Nguyễn Văn A</p>
          <p className="text-body text-text-primary/60">a@vidu.com</p>
        </Card>

        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Ví cá nhân</h2>
          <p className="text-figures text-2xl font-semibold text-court-green">450.000đ</p>
        </Card>

        <Card className="sm:col-span-1">
          <h2 className="text-caption mb-2">Ví kinh doanh</h2>
          <p className="text-figures text-2xl font-semibold text-primary-blue">0đ</p>
          <p className="text-body text-text-primary/50">Chưa là nhà cung cấp</p>
        </Card>
      </div>

      <h2 className="text-h2 mt-10 mb-4 text-xl">Lịch sử booking</h2>
      <div className="flex flex-col gap-3">
        {MOCK_BOOKING_HISTORY.map((b) => (
          <Card key={b.id} className="flex items-center justify-between">
            <div>
              <p className="text-body font-medium">{b.court}</p>
              <p className="text-body text-text-primary/50">{b.date}</p>
            </div>
            <div className="text-right">
              <p className="text-figures font-medium">{b.price.toLocaleString('vi-VN')}đ</p>
              <p className="text-caption">{b.status}</p>
            </div>
          </Card>
        ))}
      </div>
      <DisputePanel />
      <FinancePanel />
    </div>
  );
}
