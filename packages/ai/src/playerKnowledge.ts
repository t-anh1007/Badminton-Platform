// Bộ kiến thức nghiệp vụ cho chatbot người chơi. Rút từ docs/product/tom-tat-luong-nghiep-vu.md (chỉ phần người
// chơi được biết). Không chứa source code, quy trình nội bộ Admin hay ví nền tảng. Sửa nghiệp vụ → sửa ở đây.

export interface KnowledgeSection {
  id: string;
  title: string;
  text: string;
}

export const PLAYER_KNOWLEDGE: readonly KnowledgeSection[] = [
  {
    id: 'K-WALLET',
    title: 'Ví cá nhân',
    text: 'Mỗi người chơi có một ví cá nhân. Tiền vào ví từ: nạp, hoàn tiền, tiền thắng kèo. Số dư không bao giờ âm và không chuyển tiền trực tiếp giữa người dùng. '
      + 'Tiền nạp chủ động không rút được; chỉ tiền hoàn, tiền thắng kèo, tiền dư mới vào phần "rút được". Khi thanh toán, hệ thống trừ phần không rút được trước.',
  },
  {
    id: 'K-BOOKING',
    title: 'Đặt sân',
    text: 'Tìm sân trên danh sách hoặc bản đồ, xem lịch trống, giá và bản đồ nhiệt giờ đông/vắng, chọn sân con và giờ. Nếu trùng lịch cá nhân, hệ thống cảnh báo và hỏi xác nhận (không chặn). '
      + 'Hệ thống giữ chỗ 10 phút và chụp lại giá cùng chính sách hủy tại thời điểm đặt. Thanh toán bằng ví (trừ ngay) hoặc chuyển khoản VietQR (ghi đúng nội dung chuyển khoản). '
      + 'Tiền về trong 10 phút → booking "Đã xác nhận". Hết 10 phút không trả → tự nhả chỗ. Tiền chuyển khoản tới sau 10 phút → booking không khôi phục, toàn bộ tiền cộng vào ví cá nhân, bạn tự đặt lại.',
  },
  {
    id: 'K-CANCEL',
    title: 'Hủy sân và hoàn tiền',
    text: 'Người chơi tự hủy: hoàn theo chính sách đã chụp lúc đặt — hủy từ 24 giờ trước giờ chơi hoàn 100%; từ 6 đến dưới 24 giờ hoàn 50%; dưới 6 giờ không hoàn. '
      + 'Chủ sân hủy, lỗi nền tảng hoặc sân ngừng hoạt động: luôn hoàn 100%. Tiền hoàn luôn vào ví cá nhân (phần rút được), không trả ngược về ngân hàng. '
      + 'Trong lúc xử lý giao diện hiện "Đang hoàn tiền", xong hiện "Đã hoàn tiền". Bạn tự hủy trong mục Lượt đặt sân của tôi; trợ lý không hủy hộ.',
  },
  {
    id: 'K-DISPUTE',
    title: 'Tranh chấp giao dịch đặt sân',
    text: 'Sau khi ca chơi kết thúc và chưa quá 24 giờ, bạn có thể gửi tranh chấp cho booking: chọn vấn đề, mô tả, số điện thoại, tối đa 5 ảnh. '
      + 'Admin xem xét và quyết định hoàn toàn bộ, hoàn một phần hoặc bác. Tiền hoàn vào ví cá nhân. Quyết định của Admin là cuối cùng.',
  },
  {
    id: 'K-WITHDRAW',
    title: 'Rút tiền',
    text: 'Chỉ rút được phần "rút được" của ví cá nhân (tiền hoàn, tiền thắng kèo, tiền dư), tối thiểu 10.000đ, mỗi lúc chỉ một yêu cầu đang chờ. '
      + 'Nhập số tiền và tài khoản ngân hàng nhận; số tiền chuyển sang "đang chờ rút". Admin chuyển khoản thủ công, hệ thống tự đối soát và báo khi đã chi. '
      + 'Khi yêu cầu còn "Chờ xử lý" bạn tự hủy được, tiền trở lại khả dụng.',
  },
  {
    id: 'K-MATCH-CREATE',
    title: 'Tạo kèo',
    text: 'Chủ kèo chọn một slot đang giữ hoặc booking đã trả của mình, cách giờ chơi ít nhất 24 giờ. Chọn giao lưu hoặc xếp hạng, đơn hoặc đôi, tỷ lệ ký quỹ 5:5, 6:4 hoặc 7:3 (thua : thắng), '
      + 'khoảng trình độ, BO3 hoặc BO5, rồi công bố. Cấu hình bị khóa sau khi công bố. Hạn chốt tính từ lúc tạo theo thời gian còn lại tới giờ chơi: dưới 48h cộng 6h; 48–72h cộng 12h; 72–120h cộng 18h; từ 120h cộng 24h.',
  },
  {
    id: 'K-MATCH-JOIN',
    title: 'Tham gia kèo và ký quỹ',
    text: 'Tìm kèo hoặc nhận gợi ý từ trợ lý, chọn đội. Hệ thống giữ chỗ 10 phút; ai giữ trước được, người sau nhận "kèo đã đầy". Nộp ký quỹ bằng ví hoặc VietQR; tiền được tạm giữ theo kèo, không vào ví chủ kèo. '
      + 'Hết 10 phút chưa trả thì nhả chỗ; tiền chuyển khoản tới muộn cộng vào ví cá nhân. Ví dụ kèo đơn 7:3, giá sân 200k: mỗi bên nộp 140k, 200k trả sân, 80k tạm giữ chờ kết quả. '
      + 'Rút khỏi kèo trước hạn chốt được hoàn 100% ký quỹ vào ví cá nhân; sau hạn chốt không rút tự do.',
  },
  {
    id: 'K-PARTNER',
    title: 'Mời đồng đội kèo đôi',
    text: 'Với kèo đôi, chủ kèo mời đồng đội đích danh (email, số điện thoại hoặc người từng chơi cùng). Đồng đội tự trả, hoặc chủ kèo trả thay; mọi khoản hoàn của chỗ trả thay về ví chủ kèo, tiền thắng về đồng đội.',
  },
  {
    id: 'K-MATCH-CUTOFF',
    title: 'Hạn chốt kèo',
    text: 'Tại hạn chốt, đủ người và đủ tiền thì hệ thống tự trả sân, kèo diễn ra; phần dư là tiền tạm giữ chờ kết quả. Thiếu người thì kèo bị hủy và hoàn toàn bộ ký quỹ vào ví cá nhân '
      + '(nếu kèo dùng booking đã trả của chủ kèo thì booking giữ nguyên cho chủ kèo). Sân bị hủy trước khi có kết quả thì hoàn đủ tiền tạm giữ.',
  },
  {
    id: 'K-RESULT',
    title: 'Khai kết quả kèo',
    text: 'Hết giờ chơi, chỉ chủ kèo nhập tỷ số từng set kèm 1–3 ảnh trong 12 giờ. Người còn lại có 12 giờ để đồng ý, khiếu nại hoặc báo sự cố. Không ai phản đối (hoặc đối thủ xác nhận sớm) thì kết quả được chốt: '
      + 'tiền tạm giữ trả cho đội thắng vào ví cá nhân (rút được), kèo xếp hạng cập nhật điểm. Không ai khai trong 12 giờ → tạm "Không có kết quả", thêm 12 giờ báo sự cố, vẫn không có thì chia chi phí 50:50 và không tính điểm. '
      + 'Báo vắng mặt chỉ được sau giờ bắt đầu 15 phút. Không có check-in.',
  },
  {
    id: 'K-APPEAL',
    title: 'Khiếu nại kết quả kèo',
    text: 'Khi có khiếu nại, tiền tạm giữ và điểm bị khóa. Chủ sân có 24 giờ đưa đề xuất (chỉ để tham khảo), sau đó Admin quyết định trong 48 giờ: Đội A thắng, Đội B thắng hoặc Không có kết quả. '
      + 'Quyết định của Admin là cuối cùng; sai sót kỹ thuật thì gửi ticket hỗ trợ.',
  },
  {
    id: 'K-SKILL',
    title: 'Trình độ và điểm kinh nghiệm',
    text: 'Thang 5 bậc: Mới chơi, Yếu, Trung bình (TB), Trung bình khá (TB+), Bán chuyên, kèm điểm rating có độ bất định, tách đơn và đôi. Bạn tự khai trình độ một lần; muốn sửa thì gửi ticket để Admin duyệt '
      + '(chưa có trận: về mức bậc mới; đã có trận: chỉnh tối đa ±50). Chỉ kèo đã chốt có đội thắng mới đổi điểm kinh nghiệm (Glicko-2); tiền ký quỹ không ảnh hưởng điểm. Cùng một đối thủ chỉ tính 1 trận mỗi 7 ngày.',
  },
  {
    id: 'K-LEADERBOARD',
    title: 'Bảng xếp hạng, mùa giải, giải thưởng',
    text: 'Lên bảng xếp hạng khi có từ 5 trận xếp hạng trong mùa và độ tin cậy từ Vừa trở lên. Bảng tách đơn/đôi, toàn quốc/tỉnh và hai hạng đấu: Không chuyên (Yếu, TB) và Chuyên (TB+, Bán chuyên). '
      + 'Điểm bảng xếp hạng (Elo) reset mỗi mùa, tách khỏi điểm kinh nghiệm. Người Mới chơi (dưới 1200) chỉ chơi giao hữu. Người đạt giải có 7 ngày bổ sung thông tin nhận thưởng; quá hạn thì mất giải. '
      + 'Huy hiệu tự cấp: chuỗi thắng 5/10/15, Top 10, King of Court.',
  },
  {
    id: 'K-COMMUNITY',
    title: 'Cộng đồng và ticket hỗ trợ',
    text: 'Bài viết và bình luận công khai; thấy vi phạm thì báo cáo (mỗi người một lần mỗi nội dung), Admin xem và quyết định ẩn hoặc gỡ. '
      + 'Ticket hỗ trợ: chủ đề, nội dung, tối đa 5 ảnh; chỉ bạn và Admin thấy. Dùng ticket để xin sửa trình độ, báo sai sót sau quyết định kèo hoặc mọi vấn đề khác.',
  },
  {
    id: 'K-PROVIDER',
    title: 'Trở thành chủ sân',
    text: 'Nộp hồ sơ chủ sân, chờ Admin duyệt. Được duyệt thì tạo cơ sở, sân con, giờ hoạt động, biểu giá để sân xuất hiện cho người chơi đặt.',
  },
  {
    id: 'K-ASSISTANT',
    title: 'Trợ lý CourtIn',
    text: 'Trợ lý trả lời dựa trên chính sách và dữ liệu của chính người hỏi. Trợ lý không tự đặt sân, thanh toán, hủy, tham gia kèo hay khiếu nại; chỉ hướng dẫn và đưa nút tới đúng trang để bạn tự xác nhận. '
      + 'Trợ lý không cung cấp dữ liệu của người dùng khác và không trả lời về mã nguồn hay cách hệ thống xử lý bên trong.',
  },
];

export function knowledgeById(id: string): KnowledgeSection | undefined {
  return PLAYER_KNOWLEDGE.find((section) => section.id === id);
}
