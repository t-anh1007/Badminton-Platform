import { Link } from 'react-router-dom';
import { SurfaceCard } from '../../components/ui';

const shortcuts = [
  {
    to: '/manage/venues',
    icon: '🏸',
    title: 'Quản lý cơ sở',
    description: 'Tạo/sửa cơ sở, thêm sân, cập nhật ảnh, giờ mở cửa và giá.',
    cta: 'Đi tới danh sách cơ sở',
  },
  {
    to: '/manage/calendar',
    icon: '📅',
    title: 'Lịch đặt',
    description: 'Xem lịch theo tuần, xử lý booking sắp diễn ra và điểm danh.',
    cta: 'Mở lịch',
  },
  {
    to: '/manage/incidents',
    icon: '⚠️',
    title: 'Sự cố & tranh chấp',
    description: 'Theo dõi khiếu nại của người chơi và phản hồi trong thời gian quy định.',
    cta: 'Xem sự cố',
  },
  {
    to: '/manage/finance',
    icon: '💰',
    title: 'Tài chính',
    description: 'Đối soát doanh thu, xem lịch sử giao dịch và số dư ví cơ sở.',
    cta: 'Mở tài chính',
  },
] as const;

export function ManageOverviewPage() {
  return (
    <div className="grid gap-6">
      <SurfaceCard>
        <h2 className="text-h2">Tổng quan kinh doanh</h2>
        <p className="mt-2 text-sm text-ink-500">
          Bắt đầu bằng việc cập nhật cơ sở của bạn, rồi kiểm tra lịch đặt và tài chính mỗi ngày.
        </p>
      </SurfaceCard>

      <div className="grid gap-4 sm:grid-cols-2">
        {shortcuts.map(({ to, icon, title, description, cta }) => (
          <Link key={to} to={to} className="block rounded-2xl focus-visible:outline-none">
            <SurfaceCard hoverable className="h-full">
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-xl">
                    {icon}
                  </span>
                  <h3 className="text-h3 text-ink-900">{title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-500">{description}</p>
                <span className="mt-auto pt-4 text-sm font-semibold text-brand-navy">{cta} →</span>
              </div>
            </SurfaceCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
