import { Link, NavLink, useLocation } from 'react-router-dom';

type InformationPage = {
  eyebrow: string;
  title: string;
  lead: string;
  sections: Array<{ title: string; body: string }>;
};

const informationByPath: Record<string, InformationPage> = {
  '/about': {
    eyebrow: 'VỀ COURTIN',
    title: 'Chơi cầu lông dễ hơn, kết nối gần hơn',
    lead: 'COURTIN giúp người chơi tìm sân, tìm kèo và xây dựng cộng đồng cầu lông trong cùng một nơi.',
    sections: [
      { title: 'Điều chúng tôi hướng tới', body: 'Giảm thời gian tìm sân, tạo thêm những trận đấu phù hợp và giúp mỗi cuộc hẹn trên sân trở nên rõ ràng, đáng tin cậy.' },
      { title: 'Dành cho ai', body: 'Người chơi muốn đặt sân hoặc tìm bạn đánh; chủ sân muốn quản lý lịch và phục vụ khách thuận tiện hơn.' },
      { title: 'Cách COURTIN vận hành', body: 'Bạn chọn sân và khung giờ, theo dõi lịch đặt, tìm kèo theo nhu cầu và hoàn thành trận để xây dựng hồ sơ trình độ của mình.' },
    ],
  },
  '/contact': {
    eyebrow: 'LIÊN HỆ',
    title: 'Chúng tôi sẵn sàng hỗ trợ',
    lead: 'Gửi câu hỏi khi bạn cần hỗ trợ về đặt sân, thanh toán, kèo đấu hoặc tài khoản.',
    sections: [
      { title: 'Trợ lý AI', body: 'Dùng nút Trợ lý AI ở góc dưới màn hình để nhận hướng dẫn nhanh về các thao tác phổ biến.' },
      { title: 'Hỗ trợ trong ứng dụng', body: 'Vào mục Hỗ trợ để gửi yêu cầu có kèm ngữ cảnh. Hãy mô tả rõ thời điểm, sân hoặc mã giao dịch nếu có.' },
      { title: 'Phản hồi sản phẩm', body: 'Chúng tôi luôn ghi nhận góp ý giúp trải nghiệm đặt sân và tìm kèo tốt hơn cho cộng đồng cầu lông.' },
    ],
  },
  '/terms': {
    eyebrow: 'ĐIỀU KHOẢN',
    title: 'Nguyên tắc sử dụng COURTIN',
    lead: 'Khi dùng COURTIN, bạn đồng ý cung cấp thông tin chính xác và tôn trọng các thành viên khác trong cộng đồng.',
    sections: [
      { title: 'Tài khoản và thông tin', body: 'Bạn chịu trách nhiệm bảo vệ thông tin đăng nhập, giữ thông tin liên hệ chính xác và chỉ sử dụng tài khoản của chính mình.' },
      { title: 'Đặt sân và tham gia kèo', body: 'Hãy kiểm tra sân, thời gian, số tiền và quy tắc trước khi xác nhận. Các bên cần tôn trọng lịch đặt và quy tắc của cơ sở.' },
      { title: 'Hành vi cộng đồng', body: 'Không dùng nền tảng để quấy rối, gian lận, giả mạo hoặc đăng nội dung vi phạm pháp luật và tiêu chuẩn cộng đồng.' },
    ],
  },
  '/cancellation-policy': {
    eyebrow: 'CHÍNH SÁCH HỦY',
    title: 'Hủy sân minh bạch theo thời điểm',
    lead: 'Mức hoàn được xác định từ chính sách đã lưu cùng lượt đặt sân của bạn tại thời điểm đặt.',
    sections: [
      { title: 'Các mốc hoàn tiền', body: 'Theo chính sách mặc định, hủy từ 24 giờ trước giờ chơi được hoàn 100%; từ 6 đến dưới 24 giờ được hoàn 50%; dưới 6 giờ không hoàn tiền.' },
      { title: 'Cách hủy lượt đặt sân', body: 'Mở Hồ sơ, chọn lượt đặt sân sắp diễn ra, xem mức hoàn dự kiến rồi xác nhận hủy. Lượt đặt sân đã bắt đầu không thể hủy trên ứng dụng.' },
      { title: 'Điều cần lưu ý', body: 'Chính sách snapshot của lượt đặt sân là căn cứ cuối cùng vì từng sân có thể có cấu hình hoàn tiền khác nhau khi bạn đặt sân.' },
    ],
  },
  '/privacy': {
    eyebrow: 'CHÍNH SÁCH BẢO MẬT',
    title: 'Thông tin của bạn được dùng có mục đích',
    lead: 'COURTIN xử lý dữ liệu cần thiết để vận hành tài khoản, đặt sân, thanh toán và các tính năng cộng đồng.',
    sections: [
      { title: 'Thông tin được sử dụng', body: 'Bao gồm thông tin tài khoản, liên hệ, lịch đặt, giao dịch và nội dung bạn chủ động gửi để sử dụng các chức năng của nền tảng.' },
      { title: 'Mục đích xử lý', body: 'Dữ liệu được dùng để xác thực, thực hiện đặt sân và thanh toán, hỗ trợ người dùng, ngăn ngừa gian lận và cải thiện dịch vụ.' },
      { title: 'Bảo vệ tài khoản', body: 'Không chia sẻ mật khẩu hoặc mã xác thực. Nếu thấy hoạt động bất thường, hãy đổi mật khẩu và gửi yêu cầu hỗ trợ ngay.' },
    ],
  },
};

const tabs = [['/about', 'Về chúng tôi'], ['/contact', 'Liên hệ'], ['/terms', 'Điều khoản'], ['/cancellation-policy', 'Chính sách hủy'], ['/privacy', 'Chính sách bảo mật']] as const;

export function FooterInformationPage() {
  const { pathname } = useLocation();
  const page = informationByPath[pathname] ?? informationByPath['/about'];

  return <div className="page-container grid gap-10 py-10 sm:py-14 lg:grid-cols-[240px_minmax(0,680px)] lg:justify-center lg:gap-16">
    <nav aria-label="Trang thông tin" className="grid content-start gap-1 lg:sticky lg:top-28">
      {tabs.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-xl px-4 py-3 text-[15px] font-semibold ${isActive ? 'border border-line bg-surface text-brand-navy shadow-[var(--shadow-card)]' : 'text-ink-700 hover:bg-surface/70'}`}>{label}</NavLink>)}
    </nav>
    <article>
      <p className="courtin-kicker">{page.eyebrow}</p>
      <h1 className="mt-2 text-h1">{page.title}</h1>
      <p className="mt-5 text-lg leading-8 text-ink-900">{page.lead}</p>
      {page.sections.map((section, index) => <section key={section.title} className="mt-9">
        <h2 className="text-h3 !text-[22px]">{index + 1}. {section.title}</h2>
        <p className="mt-3 text-[17px] leading-8 text-ink-700">{section.body}</p>
      </section>)}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-green-100 bg-green-50 p-6">
        <div><p className="font-bold text-ink-900">Còn câu hỏi?</p><p className="text-sm text-ink-500">Đội ngũ vận hành phản hồi qua Trung tâm hỗ trợ.</p></div>
        <Link to="/support" className="inline-flex min-h-10 items-center rounded-full bg-brand-navy px-5 text-xs font-bold uppercase tracking-[0.035em] text-surface">Liên hệ hỗ trợ</Link>
      </div>
    </article>
  </div>;
}
