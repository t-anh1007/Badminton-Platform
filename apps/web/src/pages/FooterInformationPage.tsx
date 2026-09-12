import { Link, useLocation } from 'react-router-dom';
import { PageHeader } from '../components/courtin/PageHeader.js';
import { Button, SurfaceCard } from '../components/ui.js';

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
    lead: 'Mức hoàn được xác định từ chính sách đã lưu cùng booking của bạn tại thời điểm đặt.',
    sections: [
      { title: 'Các mốc hoàn tiền', body: 'Theo chính sách mặc định, hủy từ 24 giờ trước giờ chơi được hoàn 100%; từ 6 đến dưới 24 giờ được hoàn 50%; dưới 6 giờ không hoàn tiền.' },
      { title: 'Cách hủy booking', body: 'Mở Hồ sơ, chọn booking sắp diễn ra, xem mức hoàn dự kiến rồi xác nhận hủy. Booking đã bắt đầu không thể hủy trên ứng dụng.' },
      { title: 'Điều cần lưu ý', body: 'Chính sách snapshot của booking là căn cứ cuối cùng vì từng sân có thể có cấu hình hoàn tiền khác nhau khi bạn đặt sân.' },
    ],
  },
  '/privacy': {
    eyebrow: 'CHÍNH SÁCH BẢO MẬT',
    title: 'Thông tin của bạn được dùng có mục đích',
    lead: 'COURTIN xử lý dữ liệu cần thiết để vận hành tài khoản, đặt sân, thanh toán và các tính năng cộng đồng.',
    sections: [
      { title: 'Thông tin được sử dụng', body: 'Bao gồm thông tin tài khoản, liên hệ, lịch đặt, giao dịch và nội dung bạn chủ động gửi để sử dụng các chức năng của nền tảng.' },
      { title: 'Mục đích xử lý', body: 'Dữ liệu được dùng để xác thực, thực hiện booking và thanh toán, hỗ trợ người dùng, ngăn ngừa gian lận và cải thiện dịch vụ.' },
      { title: 'Bảo vệ tài khoản', body: 'Không chia sẻ mật khẩu hoặc mã xác thực. Nếu thấy hoạt động bất thường, hãy đổi mật khẩu và gửi yêu cầu hỗ trợ ngay.' },
    ],
  },
};

export function FooterInformationPage() {
  const { pathname } = useLocation();
  const page = informationByPath[pathname] ?? informationByPath['/about'];

  return <section className="page-container py-10 sm:py-14">
    <PageHeader eyebrow={page.eyebrow} title={page.title} description={page.lead} />
    <div className="mt-7 grid gap-4 md:grid-cols-3">
      {page.sections.map((section) => <SurfaceCard key={section.title} className="h-full">
        <h2 className="text-h3">{section.title}</h2>
        <p className="mt-3 text-sm leading-6 text-ink-500">{section.body}</p>
      </SurfaceCard>)}
    </div>
    <div className="mt-8"><Link to="/venues"><Button>Tìm sân gần bạn</Button></Link></div>
  </section>;
}
