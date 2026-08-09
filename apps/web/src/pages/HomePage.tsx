import { Link } from 'react-router-dom';
import { Card } from '../components/Card';
import { EmptyState } from '../components/ui';

const features: readonly { title: string; body: string; to?: string }[] = [
  { title: 'Đặt sân', body: 'Tìm sân trống, giữ chỗ 10 phút và thanh toán an toàn.', to: '/venues' },
  { title: 'Kèo', body: 'Tìm người chơi phù hợp và tham gia theo luồng xác nhận rõ ràng.' },
  { title: 'Cộng đồng', body: 'Chia sẻ trải nghiệm cầu lông trong không gian công khai, lành mạnh.' },
] as const;

const faq = [
  ['Tôi giữ sân được bao lâu?', 'Một slot được giữ trong 10 phút. Hết thời gian, slot tự mở lại cho người khác.'],
  ['Hủy sân có được hoàn tiền không?', 'Từ 24 giờ trước giờ bắt đầu hoàn 100%; từ 6 đến dưới 24 giờ hoàn 50%; dưới 6 giờ không hoàn.'],
  ['Tôi có thể tìm kèo ở đâu?', 'Bạn sẽ thấy kèo công khai phù hợp từ mục Kèo khi giao diện Giai đoạn 2 được mở.'],
  ['Tôi thanh toán bằng cách nào?', 'Bạn có thể dùng số dư nội bộ hoặc tạo mã chuyển khoản SePay ở bước thanh toán.'],
] as const;

export function HomePage() {
  return (
    <main>
      <section className="page-container grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_.85fr] lg:items-center">
        <div>
          <p className="text-caption text-green-700">Nền tảng cầu lông</p>
          <h1 className="mt-3 max-w-xl text-[clamp(2.5rem,5vw,3rem)] font-bold leading-[1.15] tracking-tight text-ink-900">Đặt sân cầu lông.<br />Tìm kèo. Nâng trình.</h1>
          <p className="mt-5 max-w-xl text-body text-ink-500">Một nơi thân thiện để bạn chọn sân, chơi cùng đúng người và theo dõi hành trình của mình.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/venues" className="inline-flex items-center rounded-full bg-green-600 px-6 py-3 font-semibold text-surface hover:-translate-y-px hover:bg-green-700">Đặt sân ngay</Link>
            <span aria-disabled="true" title="Trang Kèo sẽ mở ở P2-FE2" className="inline-flex cursor-not-allowed items-center rounded-full border border-line bg-surface px-6 py-3 font-semibold text-ink-300">Khám phá kèo</span>
          </div>
        </div>
        <div aria-hidden className="relative min-h-72 overflow-hidden rounded-2xl bg-green-100 p-8">
          <svg viewBox="0 0 440 300" className="absolute inset-0 h-full w-full fill-none stroke-green-700/30" strokeWidth="2"><rect x="40" y="35" width="360" height="230" rx="16" /><path d="M220 35v230M40 150h360M95 35v230M345 35v230" /></svg>
          <div className="relative ml-auto grid h-16 w-16 place-items-center rounded-full bg-surface text-3xl text-green-700 shadow-sm">⌁</div>
          <p className="relative mt-20 max-w-48 rounded-2xl rounded-bl-sm bg-surface p-4 text-sm font-medium text-ink-700 shadow-sm">Rảnh chiều nay không?</p>
          <p className="relative ml-auto mt-3 w-fit rounded-2xl rounded-br-sm bg-green-600 p-4 text-sm font-medium text-surface">Kiếm kèo nào!</p>
        </div>
      </section>

      <section className="page-container pb-12">
        <div className="flex items-end justify-between gap-4"><div><p className="text-caption text-green-700">Theo khu vực</p><h2 className="mt-1 text-h2">Sân nổi bật</h2></div><Link to="/venues" className="text-sm font-semibold text-green-700 hover:underline">Xem tất cả</Link></div>
        <div className="mt-5"><EmptyState title="Chọn khu vực để xem sân" description="Danh sách sân dùng vị trí bạn chọn, nên chúng tôi không tự đặt một thành phố mặc định." action={<Link to="/venues" className="inline-flex rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas">Chọn khu vực</Link>} /></div>
      </section>

      <section className="page-container py-12">
        <h2 className="text-h2">Bạn muốn làm gì hôm nay?</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {features.map((feature) => feature.to ? <Link key={feature.title} to={feature.to}><Card className="h-full"><h3 className="text-h3">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-ink-500">{feature.body}</p></Card></Link> : <Card key={feature.title} className="h-full"><h3 className="text-h3">{feature.title}</h3><p className="mt-2 text-sm leading-6 text-ink-500">{feature.body}</p></Card>)}
        </div>
      </section>

      <section className="page-container py-12">
        <h2 className="text-h2">Câu hỏi thường gặp</h2>
        <div className="mt-5 divide-y divide-line rounded-2xl border border-line bg-surface">
          {faq.map(([question, answer]) => <details key={question} className="group p-5"><summary className="cursor-pointer list-none font-semibold text-ink-900">{question}<span className="float-right text-green-700 group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-sm leading-6 text-ink-500">{answer}</p></details>)}
        </div>
      </section>
    </main>
  );
}
