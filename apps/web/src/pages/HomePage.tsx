import { Link } from 'react-router-dom';
import { Card } from '../components/Card';

const FEATURES = [
  {
    title: 'Đặt sân',
    body: 'Tìm sân trống theo giờ, giữ chỗ 10 phút, thanh toán an toàn.',
    to: '/booking',
  },
  {
    title: 'Cộng đồng',
    body: 'Giao lưu, tìm kèo, lập nhóm cùng người chơi khác.',
    to: '#',
  },
  {
    title: 'Xếp hạng',
    body: 'Theo dõi tiến bộ và chơi cùng người ở trình độ phù hợp.',
    to: '#',
  },
];

export function HomePage() {
  return (
    <div className="bg-canvas">
      <section className="page-container py-16 sm:py-24">
        <p className="text-caption text-green-700">Cầu lông, gần bạn hơn</p>
        <h1 className="mt-3 max-w-2xl text-h1 text-ink-900">Đặt sân và tìm bạn chơi, thật dễ dàng.</h1>
        <p className="mt-4 max-w-xl text-body text-ink-500">Kết nối sân, người chơi và cộng đồng cầu lông trên một nền tảng thân thiện.</p>
        <div className="mt-7 flex flex-wrap gap-3"><Link to="/booking" className="inline-flex items-center justify-center rounded-full bg-green-600 px-6 py-3 text-base font-semibold text-surface transition duration-150 hover:-translate-y-px hover:bg-green-700">Đặt sân ngay</Link><Link to="/auth" className="inline-flex items-center justify-center rounded-full border border-line bg-surface px-6 py-3 text-base font-semibold text-ink-900 transition duration-150 hover:-translate-y-px hover:bg-canvas">Đăng nhập để bắt đầu</Link></div>
      </section>
      <section className="page-container pb-16 sm:pb-24">
        <h2 className="text-h2 mb-6">Bạn muốn làm gì hôm nay?</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <h3 className="text-h2 mb-2 text-lg">{f.title}</h3>
              <p className="text-body text-ink-500">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
