import { Link } from 'react-router-dom';
import { Hero } from '../components/Hero';
import { Card } from '../components/Card';

const FEATURES = [
  {
    title: 'Đặt sân',
    body: 'Tìm sân trống theo giờ, giữ chỗ 10 phút, thanh toán an toàn.',
    to: '/booking',
  },
  {
    title: 'Cộng đồng',
    body: 'Giao lưu, tìm kèo, lập nhóm cùng người chơi khác. (Sắp ra mắt)',
    to: '#',
  },
  {
    title: 'Xếp hạng',
    body: 'Theo dõi tiến bộ, so tài với người chơi cùng trình. (Sắp ra mắt)',
    to: '#',
  },
];

export function HomePage() {
  return (
    <div>
      <Hero
        title="Đặt sân cầu lông, dễ như một cú chạm"
        subtitle="Kết nối doanh nghiệp sân, người chơi và cộng đồng cầu lông trên một nền tảng."
        actions={
          <>
            <Link
              to="/booking"
              className="rounded-full bg-accent-shuttle px-6 py-3 text-caption text-court-green transition-transform hover:-translate-y-0.5"
            >
              Đặt sân ngay
            </Link>
            <Link
              to="/auth"
              className="rounded-full border border-on-dark/40 px-6 py-3 text-caption text-on-dark transition-colors hover:bg-on-dark/10"
            >
              Tham gia cộng đồng
            </Link>
          </>
        }
      />

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-h2 mb-8 text-center">Ba tính năng chính</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="text-h2 mb-2 text-lg">{f.title}</h3>
              <p className="text-body text-text-primary/70">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
