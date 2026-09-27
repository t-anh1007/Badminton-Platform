---
type: brainstorm
feature: matchmaking-passport
status: draft
updated: 2026-09-23
links:
  - ../../product/specs/matchmaking-passport.md
  - ../../product/specs/finance-match-fee.md
  - ../../product/specs/finance-disputes.md
  - ../../product/decision-log.md
---

# Kèo cạnh tranh, điểm xếp hạng, Court Credit và chương trình treo thưởng

## 1. Idea Seed

Phát triển “kèo” từ một cách ghép người chơi đơn giản thành trải nghiệm cạnh tranh minh bạch: người chơi chọn trận giao lưu hoặc xếp hạng, tự khai báo kết quả kèm bằng chứng, có thời gian khiếu nại, được cập nhật điểm xếp hạng và có thể nhận Court Credit được bảo chứng bằng tiền thật của nền tảng.

Admin có thể tạo chương trình treo thưởng tiền thật theo bảng xếp hạng hoặc thành tích nổi bật. Phần thưởng không hình thành từ việc chuyển tiền giữa người thắng và người thua; tiền sân vẫn được chia đều cho những người tham gia.

## 2. Context

Hệ thống hiện có hồ sơ trình độ và Glicko-2 nhưng chưa biến “kèo” thành một vòng cạnh tranh hoàn chỉnh, chưa có bảng xếp hạng công khai, cơ chế tự khai báo kết quả, Court Credit có nguồn bảo chứng, hoặc chương trình treo thưởng theo kỳ.

Thiết kế này giải quyết bốn nhu cầu chính:

- Người chơi nhìn thấy rõ trận nào ảnh hưởng điểm xếp hạng và phần thưởng.
- Kết quả thông thường được xử lý mà không phải chờ Admin xác nhận từng trận.
- Chủ sân được thanh toán đủ khi người chơi dùng Court Credit.
- Admin kiểm soát được nghĩa vụ Credit và có thể vận hành chương trình tiền thưởng công khai.

Phạm vi không bao gồm giải đấu, phí tham dự để tạo quỹ thưởng, chuyển tiền cược giữa người chơi, xác minh đủ 18 tuổi, hoặc quy trình pháp lý và thuế cho phần thưởng tiền thật. Trước khi triển khai, toàn bộ giao diện liên quan phải được mockup trên desktop và được duyệt.

## 3. User Types (preliminary)

| User Type | Pain Point | Primary Need |
|-----------|------------|--------------|
| Người chơi ranked | Không biết trận nào ảnh hưởng trình độ, kết quả được xác nhận ra sao và phần thưởng có giá trị thế nào | Luồng thi đấu, khai báo, rating và phần thưởng minh bạch |
| Chủ kèo | Khó cấu hình đúng thể thức và thành phần trận | Tạo kèo giao lưu/xếp hạng, đơn/đôi với điều kiện rõ ràng |
| Thành viên đội đôi | Phụ thuộc đồng đội trong thanh toán và khai báo kết quả | Chia đều tiền sân; một người bên thắng có thể khai báo cho cả đội |
| Đối thủ | Có nguy cơ bị khai sai kết quả | Nhận thông báo, xem bằng chứng và khiếu nại trong thời hạn rõ ràng |
| Chủ sân | Không muốn chịu phần giảm giá do Court Credit và cần hỗ trợ xác minh sự cố | Nhận settlement bình thường; xem xét sự cố tại sân và gửi đề xuất |
| Admin vận hành | Không thể duyệt thủ công mọi trận nhưng vẫn phải xử lý trường hợp bất thường | Chỉ xử lý tranh chấp, xung đột và quyết định cuối cùng |
| Admin phần thưởng | Cần treo thưởng linh hoạt mà không tạo nghĩa vụ tài chính mất kiểm soát | Cấu hình chương trình, Credit Pool, backlog và ghi nhận trả thưởng |

## 4. Capabilities Breakdown

### P0 — must have

- Tạo kèo theo chế độ **Giao lưu** hoặc **Xếp hạng**, và theo thể thức **Đánh đơn** hoặc **Đánh đôi**.
- Khóa chế độ và thể thức sau khi có người tham gia.
- Chỉ cho người đã xác minh email và số điện thoại tham gia kèo xếp hạng.
- Chia đều tiền giữ chỗ cho hai người khi đánh đơn và bốn người khi đánh đôi.
- Gửi yêu cầu khai báo kết quả sau khi booking hoàn tất.
- Cho bên thắng khai báo tỷ số trong 12 giờ và bắt buộc gửi 1–3 ảnh bằng chứng.
- Mở 24 giờ khiếu nại; tự chốt sớm khi toàn bộ đối thủ đồng ý.
- Tự chốt kết quả không tranh chấp; đóng băng rating và phần thưởng khi có khiếu nại hoặc sự cố.
- Cho Chủ sân xem xét sự cố trong 24 giờ và gửi đề xuất; Admin quyết định cuối cùng.
- Áp dụng thể thức tối đa 3 set, thắng 2 set, 21 điểm, hơn 2 điểm và giới hạn 30.
- Duy trì rating Glicko-2 riêng cho đánh đơn và đánh đôi; không tạo một loại XP khác.
- Công khai bảng xếp hạng toàn nền tảng và theo tỉnh/thành, tách hai dải dưới 1600 và từ 1600 trở lên.
- Kiểm soát việc cày điểm bằng giới hạn số trận được tính với cùng đối thủ hoặc đội đối phương.
- Phát Court Credit cho chiến thắng ranked đầu tiên đủ điều kiện trong ngày và cho các mốc chuỗi thắng.
- Bảo chứng Court Credit theo tỷ lệ 1 Credit bằng 1.000đ, dùng tối đa 50% booking và không cho rút/chuyển.
- Trích một phần Platform Fee đã final/settled vào Credit Pool; cho phép Admin top-up bằng ngân sách marketing hoặc tài trợ.
- Reserve 1:1 khi Credit được cấp; Chủ sân không chịu chi phí Credit.
- Ghi nhận reward thiếu tiền ở trạng thái **PENDING_FUNDING**, cấp theo thứ tự phát sinh khi Pool có tiền.
- Tự tạm dừng reward mới theo số dư an toàn và trần backlog do Admin cấu hình.
- Cho Admin tạo chương trình treo thưởng có ngày bắt đầu/kết thúc, tiêu chí, phạm vi, thể thức và nhiều hạng tiền thưởng.
- Thông báo in-app và email cho kết quả, khiếu nại, trạng thái Credit, hạn ngân hàng và trả thưởng.
- Lưu bằng chứng riêng tư, bền vững qua các lần deploy và tối thiểu 365 ngày sau khi kết quả được chốt.

### P1 — should have

- Trang quản trị Credit Pool hiển thị số dư khả dụng, số tiền đã reserve, backlog, dòng Platform Fee và top-up.
- Lịch sử Court Credit theo từng nguồn: thắng đầu ngày, mốc chuỗi, cấp từ backlog, sử dụng, hoàn lại và hết hạn.
- Badge dựa trên rating/thành tích như Chuỗi thắng 5 trận, Top 10 tỉnh/thành và King of Court.
- Bảng xếp hạng chương trình hiển thị tiền thưởng, đồng hồ đếm ngược, vị trí hiện tại và trạng thái đang chốt kết quả.
- Nhật ký quyết định của Chủ sân, Admin, thay đổi cấu hình Pool và bằng chứng chuyển tiền.
- Cảnh báo sớm cho Admin trước khi Pool chạm ngưỡng tạm dừng.

### P2 — nice to have

- Nhãn nhà tài trợ cho từng chương trình thưởng.
- Các tiêu chí nâng cao do Admin chọn như tăng rating nhiều nhất, thắng đối thủ mạnh, cặp đôi nổi bật và Fair Play.
- Phân tích xu hướng chi phí Court Credit so với Platform Fee đã settled.
- Gợi ý mức trích Platform Fee dựa trên lịch sử phát sinh reward; Admin vẫn là người quyết định.

## 5. Core Flows (Happy Path)

### 5.1 Tạo và tham gia kèo xếp hạng

1. Chủ kèo chọn chế độ Xếp hạng, Đánh đơn hoặc Đánh đôi, sân và slot.
2. Hệ thống giải thích điều kiện rating, kết quả, bằng chứng và phần thưởng hiện hành.
3. Hệ thống kiểm tra email và số điện thoại đã xác minh.
4. Người chơi tham gia; hệ thống khóa chế độ và thể thức từ người tham gia đầu tiên.
5. Tiền giữ chỗ được chia đều cho hai hoặc bốn người và mỗi người thanh toán phần của mình.
6. Khi đủ người và đủ tiền, kèo sẵn sàng diễn ra.

~~~text
Người tạo kèo
    |
    v
Chọn Giao lưu/Xếp hạng + Đơn/Đôi
    |
    v
[Xếp hạng?] -- Không --> Luồng giao lưu, không rating/reward
    |
   Có
    v
[Đã xác minh email + điện thoại?] -- Không --> Chặn tham gia + hướng dẫn xác minh
    |
   Có
    v
Người chơi tham gia --> Khóa chế độ/thể thức
    |
    v
Chia đều tiền sân --> Từng người thanh toán --> Kèo sẵn sàng
~~~

### 5.2 Khai báo và chốt kết quả

1. Booking hoàn tất; hệ thống thông báo cho toàn bộ người chơi rằng có 12 giờ để khai báo.
2. Một người thuộc bên thắng nhập tỷ số từng set và tải 1–3 ảnh bằng chứng.
3. Hệ thống kiểm tra tỷ số và tự suy ra bên thắng.
4. Hệ thống mở cửa sổ khiếu nại 24 giờ và thông báo cho đối thủ.
5. Nếu toàn bộ đối thủ đồng ý, kết quả được chốt sớm; nếu không có phản hồi, kết quả tự chốt khi hết 24 giờ.
6. Rating, bảng xếp hạng, chuỗi thắng và reward được xử lý sau khi kết quả chính thức.

~~~text
Booking hoàn tất
    |
    v
12 giờ chờ bên thắng khai báo
    |
    +-- Không khai báo --> Không có kết quả ranked
    |
    v
Nhập tỷ số + 1-3 ảnh
    |
    v
[Tỷ số hợp lệ?] -- Không --> Yêu cầu sửa
    |
   Có
    v
24 giờ khiếu nại
    |
    +-- Tất cả đồng ý --> Chốt sớm
    +-- Không phản hồi --> Chốt khi hết hạn
    +-- Có khiếu nại --> Đóng băng và chuyển xử lý sự cố
~~~

### 5.3 Xử lý khiếu nại hoặc sự cố

1. Người chơi khai báo sự cố trước, trong hoặc sau trận và gửi bằng chứng.
2. Hệ thống đóng băng kết quả, rating và reward của trận.
3. Chủ sân xem thông tin và gửi kết luận đề xuất trong 24 giờ.
4. Nếu Chủ sân có xung đột lợi ích hoặc không phản hồi đúng hạn, hồ sơ được chuyển thẳng cho Admin.
5. Admin chọn bên A thắng, bên B thắng hoặc hủy kết quả ranked.
6. Hệ thống xử lý rating/reward theo quyết định cuối và thông báo cho người chơi.

~~~text
Khiếu nại/sự cố + bằng chứng
    |
    v
Đóng băng kết quả, rating, reward
    |
    v
[Chủ sân độc lập và phản hồi trong 24 giờ?]
    | Có                              | Không
    v                                  v
Gửi đề xuất ----------------------> Admin xem xét
                                       |
                                       v
                        [A thắng | B thắng | Hủy ranked]
                                       |
                                       v
                         Xử lý cuối + gửi thông báo
~~~

### 5.4 Phát Court Credit và kiểm soát thiếu Pool

1. Kết quả ranked được chốt; hệ thống kiểm tra chống cày điểm, chiến thắng đầu ngày, hạn mức tháng hoặc mốc chuỗi.
2. Hệ thống tính số Credit theo reward tương ứng.
3. Nếu Pool có đủ số dư khả dụng, hệ thống chuyển tiền bảo chứng sang phần reserve 1:1 và cộng Credit dùng được.
4. Nếu Pool không đủ, reward được ghi nhận **PENDING_FUNDING**, chưa cộng vào số dư sử dụng.
5. Khi Platform Fee settled hoặc Admin top-up, hệ thống cấp backlog theo thứ tự phát sinh.
6. Nếu số dư khả dụng thấp hơn ngưỡng an toàn hoặc backlog chạm trần, hệ thống tạm dừng reward mới từ thời điểm tiếp theo.
7. Hệ thống chỉ mở lại khi backlog bằng 0 và số dư khả dụng đạt lại ngưỡng an toàn.

~~~text
Kết quả ranked chính thức
    |
    v
[Đủ điều kiện reward?] -- Không --> Chỉ cập nhật rating/lịch sử
    |
   Có
    v
Tính số Credit
    |
    v
[Pool đủ tiền?] -- Có --> Reserve 1:1 --> Cộng Credit dùng được
    |
   Không
    v
Ghi PENDING_FUNDING --> Chờ tiền mới --> Cấp FIFO
    |
    v
[Pool dưới ngưỡng hoặc backlog chạm trần?]
    | Có
    v
Tạm dừng reward mới --> Admin top-up/tăng tỷ lệ trích
    |
    v
Backlog = 0 và Pool đạt ngưỡng --> Mở lại
~~~

### 5.5 Dùng Court Credit để đặt sân

1. Người chơi chọn Court Credit ở bước thanh toán booking.
2. Hệ thống hiển thị Credit khả dụng, ngày hết hạn và mức dùng tối đa bằng 50% giá trị booking.
3. Người chơi xác nhận số Credit muốn dùng.
4. Người chơi thanh toán phần tiền thật còn lại.
5. Phần tiền đã reserve cho Credit bù đúng giá trị Credit được sử dụng.
6. Platform Fee vẫn tính trên giá trị booking theo chính sách và Chủ sân nhận settlement bình thường.

~~~text
Booking 200.000đ
    |
    v
Tối đa 100 Credit = 100.000đ
    |
    +--> Người chơi trả tiền thật: 100.000đ
    +--> Credit Reserved bù:       100.000đ
    |                              ---------
    +--> Giá trị booking:          200.000đ
                                       |
                                       v
                     Tính Platform Fee trên booking
                                       |
                                       v
                         Chủ sân nhận settlement đủ
~~~

### 5.6 Admin tạo và trả chương trình thưởng tiền thật

1. Admin chọn đúng một tiêu chí, phạm vi toàn nền tảng hoặc tỉnh/thành, thể thức đơn/đôi, ngày bắt đầu/kết thúc và các hạng thưởng.
2. Hệ thống công khai tiền thưởng, điều kiện, đồng hồ đếm ngược và vị trí tạm thời.
3. Khi hết kỳ, bảng xếp hạng chuyển sang Đang chốt kết quả trong tối đa 72 giờ.
4. Hệ thống tự tính người nhận; các trường hợp bằng điểm được gộp quỹ của các vị trí bị chiếm và chia đều.
5. Admin duyệt lần cuối.
6. Người nhận có 7 ngày để bổ sung thông tin ngân hàng nếu còn thiếu.
7. Admin tự chuyển tiền, ghi tham chiếu/bằng chứng và xác nhận hoàn tất.

~~~text
Admin cấu hình chương trình
    |
    v
Draft --> Scheduled --> Active
                           |
                           v
                  Hết kỳ + chốt tối đa 72 giờ
                           |
                           v
                 Hệ thống tính người nhận
                           |
                           v
                Admin duyệt lần cuối
                           |
             +-------------+-------------+
             |                           |
       Đủ thông tin                 Thiếu ngân hàng
             |                           |
             v                           v
        Admin chuyển tiền          Chờ tối đa 7 ngày
             |                           |
             v                    Quá hạn --> Hủy thưởng
          Complete
~~~

## 6. System Behavior Deep Dive

### 6.1 Decision Points

| ID | Flow | Khi nào | YES (nhánh đồng ý) | NO (nhánh từ chối) |
|----|------|---------|----------------------|---------------------|
| D1 | Tạo kèo | Người tạo chọn Xếp hạng? | Áp dụng điều kiện xác minh, rating và reward | Tạo kèo giao lưu, không rating/reward |
| D2 | Tham gia ranked | Email và điện thoại đã xác minh? | Cho tham gia | Chặn và hướng dẫn xác minh |
| D3 | Khai báo | Khai báo trong 12 giờ? | Cho gửi tỷ số và bằng chứng | Đóng luồng, không có kết quả ranked |
| D4 | Khai báo | Tỷ số đúng thể thức? | Tự suy ra bên thắng | Không cho gửi đến khi sửa đúng |
| D5 | Chốt kết quả | Toàn bộ đối thủ đồng ý? | Chốt sớm | Tiếp tục chờ hết 24 giờ hoặc khiếu nại |
| D6 | Khiếu nại | Có phản đối hoặc sự cố? | Đóng băng và chuyển Chủ sân/Admin | Tự chốt kết quả |
| D7 | Xử lý sự cố | Chủ sân độc lập và phản hồi trong 24 giờ? | Gửi đề xuất cho Admin | Chuyển thẳng Admin |
| D8 | Tính rating/reward | Trận còn trong giới hạn chống cày? | Tính rating và reward | Chỉ lưu lịch sử, không tính điểm/thưởng |
| D9 | Thưởng đầu ngày | Đây là chiến thắng ranked đủ điều kiện đầu tiên trong ngày? | Tính thưởng bằng 10% tiền thật đã đóng | Không phát thưởng đầu ngày |
| D10 | Hạn mức tháng | Tổng thưởng đầu ngày trước lần cấp còn dưới 200 Credit? | Cấp trọn reward lần cuối, sau đó dừng | Không phát thêm thưởng đầu ngày trong tháng |
| D11 | Cấp Credit | Pool đủ tiền bảo chứng 1:1? | Reserve tiền và cộng Credit dùng được | Ghi PENDING_FUNDING |
| D12 | Phanh Pool | Số dư dưới ngưỡng hoặc backlog chạm trần? | Ghi nhận reward hiện tại rồi tạm dừng reward tiếp theo | Tiếp tục vận hành |
| D13 | Mở lại Pool | Backlog bằng 0 và số dư đạt ngưỡng an toàn? | Mở lại reward mới | Tiếp tục tạm dừng |
| D14 | Thanh toán | Credit yêu cầu còn hạn, đủ số dư và không vượt 50% booking? | Cho sử dụng | Yêu cầu giảm số Credit hoặc đổi nguồn tiền |
| D15 | Chuyển bảng | Rating đạt hoặc vượt 1600? | Chuyển ngay sang bảng trên | Giữ bảng dưới 1600 |
| D16 | Trả thưởng tiền thật | Người nhận bổ sung ngân hàng trong 7 ngày? | Cho Admin trả thưởng | Hủy phần thưởng, không chuyển người kế tiếp |
| D17 | Đồng hạng | Nhiều người có cùng điểm cuối? | Gộp quỹ các vị trí bị chiếm và chia đều | Trả theo từng hạng đã cấu hình |

### 6.2 Scenario Matrix

| From State | To State | Rule | Action | Result |
|------------|----------|------|--------|--------|
| Kèo giao lưu | Hoàn tất | Có hoặc không khai báo tỷ số | Lưu lịch sử nếu có | Không rating, leaderboard hoặc reward |
| Ranked chờ khai báo | Hết hạn | Không có khai báo hợp lệ sau 12 giờ | Đóng luồng kết quả | Không có kết quả ranked |
| Ranked đã khai báo | Chính thức | Hết 24 giờ không khiếu nại hoặc đối thủ đồng ý đủ | Tự chốt | Tính rating và reward |
| Ranked đã khai báo | Tranh chấp | Có phản đối hoặc sự cố | Đóng băng | Chờ Chủ sân/Admin |
| Tranh chấp | Chính thức | Admin chọn bên thắng | Chốt theo quyết định | Tính rating/reward một lần |
| Tranh chấp | Hủy ranked | Admin chọn hủy | Không công nhận thắng/thua | Không rating/reward |
| Reward đủ điều kiện | Credit khả dụng | Pool đủ tiền | Reserve 1:1 | User có thể sử dụng Credit |
| Reward đủ điều kiện | PENDING_FUNDING | Pool thiếu tiền | Ghi nghĩa vụ theo thứ tự | Chưa tăng số dư dùng được |
| PENDING_FUNDING | Credit khả dụng | Có tiền mới và reward đến lượt | Reserve 1:1 | Bắt đầu hạn dùng 90 ngày |
| Pool bình thường | Tạm dừng reward | Chạm một trong hai ngưỡng | Dừng quyền reward phát sinh sau đó | Ranked/rating vẫn hoạt động |
| Pool tạm dừng | Bình thường | Backlog bằng 0 và đủ ngưỡng an toàn | Mở lại | Reward mới tiếp tục phát sinh |
| Chương trình Active | Đang chốt | Hết ngày kết thúc | Chờ tối đa 72 giờ | Khóa vị trí sau cùng |
| Người đạt giải | Mất quyền | Thiếu thông tin ngân hàng quá 7 ngày | Hủy phần thưởng | Không đôn người kế tiếp |

### 6.3 State Transitions

~~~text
Kết quả ranked:
CHỜ_KHAI_BÁO --> ĐÃ_KHAI_BÁO --> CHỜ_KHIẾU_NẠI --> CHÍNH_THỨC
       |                                |
       v                                v
HẾT_HẠN_KHÔNG_KẾT_QUẢ             TRANH_CHẤP --> CHỦ_SÂN_ĐỀ_XUẤT
                                                   |
                                                   v
                                             ADMIN_XỬ_LÝ
                                               /       \
                                      CHÍNH_THỨC     HỦY_RANKED

Court Credit reward:
ĐỦ_ĐIỀU_KIỆN --> CREDIT_KHẢ_DỤNG --> ĐÃ_DÙNG / HẾT_HẠN
       |
       v
PENDING_FUNDING --> CREDIT_KHẢ_DỤNG

Credit Pool:
BÌNH_THƯỜNG --> TẠM_DỪNG_REWARD_MỚI --> BÌNH_THƯỜNG

Chương trình tiền thật:
DRAFT --> SCHEDULED --> ACTIVE --> FINALIZING
                                  |
                                  v
                    AWAITING_ADMIN_APPROVAL --> PAYING --> COMPLETE
~~~

| Entity | Từ | Sang | Trigger | Quay lại được? |
|--------|----|------|---------|----------------|
| Kết quả ranked | Chờ khai báo | Đã khai báo | Bên thắng gửi tỷ số và bằng chứng hợp lệ | Không; chỉ được bổ sung qua phản hồi/khiếu nại |
| Kết quả ranked | Chờ khai báo | Hết hạn không kết quả | Qua 12 giờ | Không |
| Kết quả ranked | Chờ khiếu nại | Chính thức | Hết 24 giờ không phản đối hoặc tất cả đồng ý | Không; chỉ Admin sửa qua quy trình xử lý đặc biệt |
| Kết quả ranked | Chờ khiếu nại | Tranh chấp | Có phản đối/sự cố | Không tự quay lại |
| Kết quả ranked | Admin xử lý | Chính thức/Hủy ranked | Quyết định cuối của Admin | Không |
| Credit reward | Đủ điều kiện | Credit khả dụng | Pool đủ tiền và reserve 1:1 | Không quay về chưa cấp |
| Credit reward | Đủ điều kiện | PENDING_FUNDING | Pool thiếu tiền | Có, khi được cấp theo thứ tự |
| Credit reward | Credit khả dụng | Đã dùng | User thanh toán booking | Không |
| Credit reward | Credit khả dụng | Hết hạn | Qua 90 ngày từ lúc cấp | Không |
| Credit Pool | Bình thường | Tạm dừng reward mới | Chạm ngưỡng an toàn hoặc trần backlog | Có điều kiện |
| Credit Pool | Tạm dừng reward mới | Bình thường | Backlog bằng 0 và đủ số dư an toàn | Có |
| Chương trình | Draft | Scheduled | Admin công bố trước ngày bắt đầu | Có thể hủy trước khi bắt đầu |
| Chương trình | Active | Finalizing | Hết thời gian | Không quay lại Active |
| Chương trình | Awaiting Admin Approval | Paying | Admin duyệt người nhận | Không |
| Chương trình | Paying | Complete | Ghi nhận chuyển tiền hoàn tất | Không |

### 6.4 Interrupted Transactions

| Tình huống | Hệ thống còn lại gì | Resume | Cleanup |
|------------|---------------------|--------|---------|
| Người chơi đóng app trước khi gửi khai báo | Chưa có khai báo chính thức | Mở lại và gửi trong phần thời gian còn lại của 12 giờ | Tệp chưa gắn với khai báo không được coi là bằng chứng |
| Mạng mất khi gửi kết quả | Chỉ một khai báo hợp lệ được ghi nhận | Mở lại để xem trạng thái thực tế; gửi lại không tạo kết quả trùng | Không tính rating/reward hai lần |
| Kho lưu ảnh tạm thời không khả dụng | Không cho hoàn tất khai báo thiếu bằng chứng | Giữ nội dung form để user thử lại trong thời hạn | Không chuyển sang bước khiếu nại |
| Hai thành viên đội thắng gửi cùng lúc | Giữ khai báo hợp lệ đầu tiên; khai báo trùng không tạo luồng mới | Người còn lại có thể bổ sung bằng chứng hoặc phản hồi | Khác biệt tỷ số chuyển thành tranh chấp |
| Hai đối thủ phản hồi trái ngược | Giữ toàn bộ phản hồi và bằng chứng | Chuyển xử lý sự cố | Không tự chốt |
| App đóng trong khi thanh toán bằng Credit | Booking và Credit phải cùng thành công hoặc cùng không phát sinh | User mở lại để xem trạng thái rồi thanh toán lại nếu cần | Không làm mất Credit khi booking chưa thành công |
| Tiền mới vào Pool khi đang cấp backlog | Thứ tự phát sinh được giữ cố định | Cấp lần lượt; không bỏ qua reward đầu hàng | Phần tiền chưa đủ cho reward kế tiếp vẫn ở Pool khả dụng |
| Admin chuyển tiền thật thất bại | Chương trình vẫn ở Paying, có lịch sử lần thử | Admin thử lại và ghi tham chiếu mới | Không đánh dấu Complete trước khi xác nhận |
| Kết quả được chốt đúng lúc Pool tạm dừng | So sánh thời điểm reward chính thức đủ điều kiện với thời điểm tạm dừng | Reward đủ điều kiện trước đó vẫn được ghi PENDING_FUNDING | Reward đủ điều kiện sau đó không được truy lĩnh |

### 6.5 Other Edge Cases

- Trận không diễn ra, bị gián đoạn hoặc một bên không đến: người chơi tự khai báo sự cố kèm bằng chứng; không suy ra kết quả ranked chỉ từ booking.
- Không có người khai báo trong 12 giờ: trận không cập nhật rating, leaderboard, chuỗi hoặc reward.
- Tỷ số không thể sinh ra người thắng hợp lệ: không cho gửi.
- Bằng chứng trái ngược: luôn đóng băng trước khi cập nhật điểm hoặc tiền.
- Chủ sân là người tham gia, người liên quan hoặc sự cố do sân: bỏ qua bước kết luận của Chủ sân và chuyển Admin.
- Match đánh đôi chỉ cần một thành viên bên thắng khai báo; đối thủ của cả đội đều được thông báo.
- Khi rating vượt 1600 giữa kỳ, người chơi chuyển ngay sang bảng từ 1600 trở lên.
- Trận thứ ba trong 7 ngày với cùng đối thủ hoặc cùng đội hình đối phương vẫn có trong lịch sử nhưng không tính rating/reward.
- Court Credit hết hạn không được rút, chuyển hoặc đổi tiền mặt; tiền bảo chứng chưa dùng quay về phần khả dụng của Pool.
- Reward PENDING_FUNDING chưa bắt đầu đếm 90 ngày; hạn dùng bắt đầu khi Credit được cấp vào số dư sử dụng.
- Booking được hoàn phải tách phần tiền thật và Credit: tiền thật hoàn về nguồn phù hợp, Credit khôi phục với hạn gốc; Credit đã hết hạn trong thời gian booking không được hồi sinh.
- Khi cùng điểm cuối, không dùng tiêu chí phụ; gộp quỹ các vị trí bị chiếm và chia đều.
- Chương trình đã công bố không được giảm tiền, đổi tiêu chí hoặc rút ngắn thời gian.
- Chương trình đang chạy chỉ được buộc hủy khi Admin nhập lý do và hệ thống thông báo toàn bộ người tham gia.

## 7. Validation, Limits & Wording

### 7.1 Validation rules

| Field | Rule |
|-------|------|
| Chế độ kèo | Bắt buộc chọn Giao lưu hoặc Xếp hạng; không đổi sau khi có người tham gia |
| Thể thức | Kèo bắt buộc chọn Đơn hoặc Đôi; booking thông thường không hiển thị lựa chọn này |
| Điều kiện ranked | Email và số điện thoại đều đã xác minh |
| Tỷ số | Tối đa 3 set; thắng 2 set; mỗi set 21 điểm, hơn 2 điểm, giới hạn 30 |
| Bằng chứng kết quả/sự cố | Bắt buộc 1–3 ảnh JPG/PNG/WebP; tối đa 5 MB mỗi ảnh |
| Tỉnh/thành leaderboard | Lấy theo vị trí sân; cần ít nhất 5 trận ranked tại tỉnh/thành trong kỳ |
| Court Credit | 1 Credit bằng 1.000đ; số nguyên, không âm, không rút/chuyển |
| Thưởng thắng đầu ngày | floor(10% phần tiền thật thực tế người đó đã đóng / 1.000đ), tối đa 30 Credit |
| Tiền làm cơ sở tính thưởng | Không gồm Court Credit đã dùng hoặc khoản chưa thực thu |
| Tỷ lệ trích Platform Fee | Admin cấu hình lớn hơn 0% và không quá 100%; chỉ áp dụng cho Platform Fee final/settled phát sinh sau hiệu lực |
| Ngưỡng an toàn Pool | Admin bắt buộc nhập số tiền dương và là bội số của 1.000đ |
| Trần backlog | Admin bắt buộc nhập số tiền dương và là bội số của 1.000đ |
| Sử dụng Credit | Không vượt 50% giá trị booking và không vượt Credit còn hạn/khả dụng |
| Chương trình tiền thật | Bắt buộc có một tiêu chí, phạm vi, thể thức, ngày bắt đầu, ngày kết thúc và ít nhất một hạng thưởng |
| Hạng thưởng | Số tiền dương; cho phép nhiều hạng Top 1, Top 2, Top 3 hoặc điều kiện tương ứng |
| Thông tin nhận tiền | Email, điện thoại, họ tên, địa chỉ, ngân hàng, số tài khoản và tên chủ tài khoản |

### 7.2 Limits & Quotas (exact values)

| Tham số | Giá trị | Window | Behavior khi vượt |
|---------|---------|--------|-------------------|
| Khai báo kết quả | 12 giờ | Từ khi booking hoàn tất | Không còn kết quả ranked |
| Khiếu nại | 24 giờ | Từ khai báo hợp lệ | Tự chốt nếu không phản đối |
| Chủ sân xem xét | 24 giờ | Từ khi nhận hồ sơ | Tự chuyển Admin |
| Chốt chương trình | 72 giờ | Từ khi chương trình kết thúc | Trận còn treo không tính cho chương trình nhưng có thể cập nhật rating sau |
| Ảnh bằng chứng | 1–3 ảnh, 5 MB/ảnh | Mỗi khai báo | Chặn gửi |
| Lưu bằng chứng | Tối thiểu 365 ngày | Từ kết quả cuối | Giữ lâu hơn khi tranh chấp/trả thưởng chưa xong |
| Sử dụng Court Credit | Tối đa 50% booking | Mỗi booking | Yêu cầu giảm Credit |
| Hạn Court Credit | 90 ngày | Từ lúc Credit được cấp dùng được | Credit hết hạn; bảo chứng quay về Pool khả dụng |
| Thưởng thắng đầu ngày | 1 lần, tối đa 30 Credit | Mỗi ngày theo giờ Việt Nam | Các chiến thắng sau không nhận thưởng cơ bản |
| Ngưỡng thưởng cơ bản tháng | 200 Credit | Mỗi tháng | Nếu trước lần cấp còn dưới 200 thì cấp trọn lần cuối, sau đó dừng; tổng có thể tối đa 229 |
| Mốc chuỗi | 5/+5, 10/+10, 15/+15 và tiếp tục mỗi 5 trận | Theo chuỗi riêng Đơn/Đôi | Thua reset; giao lưu/no-result không tác động |
| Lặp mốc chuỗi | 1 lần mỗi mốc | 30 ngày trượt cho từng thể thức | Không cấp trùng cùng mốc |
| Chống cày đối thủ | 2 trận được tính | 7 ngày trượt với cùng đối thủ/đội đối phương | Trận sau chỉ lưu lịch sử |
| Điều kiện lên bảng | Tối thiểu 5 trận chính thức và RD dưới 200 | Tại thời điểm xếp hạng | Chưa hiển thị thứ hạng đủ điều kiện |
| Điều kiện bảng tỉnh/thành | Tối thiểu 5 trận tại tỉnh/thành | Trong kỳ chương trình | Không đủ điều kiện nhận hạng khu vực |
| Bổ sung ngân hàng | 7 ngày | Từ thông báo đạt giải | Mất quyền; thưởng bị hủy, không chuyển người khác |
| Set thi đấu | Tối đa 3 set, 21 điểm, trần 30 | Mỗi trận ranked | Không nhận tỷ số sai thể thức |

### 7.3 Wording samples (exact strings)

#### Error messages

| Tình huống | Wording | Code |
|------------|---------|------|
| Chưa xác minh | “Bạn cần xác minh email và số điện thoại trước khi tham gia kèo xếp hạng.” | — |
| Hết hạn khai báo | “Đã hết 12 giờ khai báo. Trận này sẽ không được tính điểm xếp hạng hoặc phần thưởng.” | — |
| Thiếu ảnh | “Vui lòng tải lên từ 1 đến 3 ảnh làm bằng chứng kết quả.” | — |
| Ảnh sai định dạng | “Ảnh phải có định dạng JPG, PNG hoặc WebP và không vượt quá 5 MB.” | — |
| Tỷ số sai | “Tỷ số chưa đúng thể thức 3 set, 21 điểm và giới hạn 30. Vui lòng kiểm tra lại.” | — |
| Kho ảnh lỗi | “Chưa thể lưu bằng chứng lúc này. Vui lòng thử lại trước khi hết thời hạn khai báo.” | — |
| Dùng quá 50% | “Court Credit chỉ được dùng tối đa 50% giá trị booking.” | — |
| Credit không đủ | “Số Court Credit khả dụng không đủ cho lựa chọn này.” | — |
| Sửa chương trình đã công bố | “Không thể giảm tiền thưởng, đổi tiêu chí hoặc rút ngắn thời gian của chương trình đã công bố.” | — |
| Quá hạn ngân hàng | “Đã quá 7 ngày bổ sung thông tin ngân hàng. Quyền nhận phần thưởng này đã bị hủy.” | — |

#### Success messages

| Tình huống | Wording |
|------------|---------|
| Gửi kết quả | “Đã gửi kết quả. Đối thủ có 24 giờ để xác nhận hoặc khiếu nại.” |
| Kết quả chính thức | “Kết quả đã được ghi nhận. Điểm xếp hạng và phần thưởng đang được xử lý.” |
| Gửi khiếu nại | “Đã ghi nhận khiếu nại. Điểm và phần thưởng của trận sẽ tạm dừng cho đến khi có kết luận.” |
| Credit được cấp | “Bạn đã nhận {credit} Court Credit, có hiệu lực đến {expiryDate}.” |
| Credit từ backlog | “Phần thưởng đang chờ ngân sách của bạn đã được cấp: {credit} Court Credit.” |
| Chương trình công bố | “Chương trình thưởng đã được công bố và sẽ bắt đầu vào {startDate}.” |
| Trả thưởng | “Phần thưởng {amount} đã được xác nhận thanh toán.” |

#### Info / neutral messages

| Tình huống | Wording |
|------------|---------|
| Giải thích Credit | “1 Court Credit = 1.000đ giảm trực tiếp khi đặt sân. Không thể rút hoặc chuyển. Mỗi booking dùng tối đa 50%.” |
| Nhắc khai báo | “Kèo đã kết thúc. Bên thắng còn {remainingTime} để khai báo tỷ số và gửi bằng chứng.” |
| Chờ khiếu nại | “Kết quả đang trong thời gian khiếu nại và sẽ được chốt sau {remainingTime} nếu không có phản đối.” |
| PENDING_FUNDING | “Bạn đã đạt phần thưởng {credit} Court Credit. Phần thưởng đang chờ ngân sách và chưa thể sử dụng.” |
| Pool tạm dừng | “Court Credit đang tạm dừng ghi nhận phần thưởng mới. Trận xếp hạng và điểm của bạn vẫn được tính bình thường.” |
| Chuyển dải hạng | “Điểm của bạn đã đạt {rating}. Bạn được chuyển sang bảng Trung bình khá – Bán chuyên.” |
| Đang chốt chương trình | “Bảng xếp hạng đang chốt kết quả, dự kiến hoàn tất trong tối đa 72 giờ.” |
| Chờ ngân hàng | “Bạn còn {remainingDays} ngày để bổ sung thông tin ngân hàng và nhận phần thưởng.” |

## 8. Assumptions

- Glicko-2 hiện hành tiếp tục là nguồn điểm xếp hạng; “XP” không phải một hệ điểm riêng.
- Rating, RD và chuỗi thắng được tách riêng giữa Đánh đơn và Đánh đôi.
- Mốc 1600 là ranh giới tức thời giữa hai bảng trình độ.
- Địa bàn tỉnh/thành của trận được xác định theo địa chỉ sân.
- Ví dụ Platform Fee 10% và tỷ lệ trích 25% chỉ để minh họa; Admin cấu hình tỷ lệ thực tế.
- Chỉ Platform Fee đã final/settled, không còn nằm trong cửa sổ hoàn/tranh chấp, mới được trích vào Credit Pool.
- Tiền đã đưa vào Pool hoặc reserve không đồng thời được xem là doanh thu khả dụng của nền tảng.
- Admin top-up là nguồn bổ sung; Platform Fee settled là nguồn chính của Pool.
- PENDING_FUNDING là nghĩa vụ chưa được bảo chứng, không phải số dư có thể chi tiêu.
- Việc tạm dừng Court Credit không dừng kèo ranked, rating, leaderboard hoặc badge.
- Reward chính thức đủ điều kiện trước thời điểm tạm dừng được giữ; reward đủ điều kiện sau đó không được truy lĩnh.
- Chủ sân không chịu chi phí Court Credit; settlement tiếp tục theo giá trị booking và chính sách Platform Fee.
- Chương trình tiền thật do nền tảng hoặc nhà tài trợ chi trả, tách biệt Credit Pool và không thu phí tham dự.
- Admin tự chuyển tiền thật và ghi nhận bằng chứng; hệ thống chưa tự động chuyển khoản ngân hàng.
- Không có danh mục treo thưởng mặc định; mỗi chương trình chỉ áp dụng tiêu chí Admin đã chọn.
- Ảnh bằng chứng phải được lưu trên kho đối tượng riêng tư dùng được ở production, không lưu trên filesystem tạm của ứng dụng.
- Email và thông báo trong ứng dụng là hai kênh chính; chưa dùng SMS.
- Mockup desktop phải được duyệt trước mọi triển khai; mobile thực hiện sau.

## 9. Risks

| Rủi ro | Khả năng | Hậu quả nghiệp vụ | Cách phòng |
|--------|----------|-------------------|------------|
| Platform Fee settled không đủ bù tốc độ phát Credit | Thỉnh thoảng | Backlog tăng, người chơi chờ lâu và mất niềm tin | Reserve 1:1, hai ngưỡng tự dừng, cảnh báo, top-up và điều chỉnh tỷ lệ trích |
| Người chơi thông đồng để cày điểm và Credit | Thường | Bảng xếp hạng sai lệch và chi phí thưởng tăng | Giới hạn 2 trận/7 ngày với cùng đối thủ hoặc đội hình, theo dõi bất thường |
| Tự khai báo kết quả bị lợi dụng | Thỉnh thoảng | Khiếu nại tăng và trải nghiệm cạnh tranh thiếu công bằng | Bắt buộc bằng chứng, cửa sổ phản đối, đóng băng và Admin quyết định cuối |
| Chủ sân chậm hoặc có xung đột lợi ích | Thỉnh thoảng | Tranh chấp kéo dài | Thời hạn 24 giờ và tự chuyển Admin |
| Tạm dừng reward nhưng thông báo không rõ | Thỉnh thoảng | Người chơi cho rằng nền tảng thất hứa | Hiển thị trạng thái trước trận, thông báo in-app/email và không ảnh hưởng rating |
| Giá trị tiền thưởng công khai nhưng trả thủ công chậm | Thỉnh thoảng | Khiếu nại, giảm uy tín chương trình | Trạng thái Paying, bằng chứng chuyển tiền, nhắc hạn và nhật ký xử lý |
| Người đạt giải thiếu thông tin ngân hàng | Thỉnh thoảng | Không thể hoàn tất trả thưởng | Nhắc in-app/email trong 7 ngày và nêu rõ hậu quả hủy thưởng |
| Bằng chứng bị mất sau deploy hoặc lộ sai người | Hiếm | Không xử lý được tranh chấp và phát sinh khiếu nại dữ liệu | Kho riêng tư bền vững, quyền xem giới hạn và lưu tối thiểu 365 ngày |
| Người mới hiểu RD như điểm yếu thay vì độ bất định | Thường | Không tin rating và bảng xếp hạng | Giải thích RD bằng ngôn ngữ đơn giản tại Passport và leaderboard |
| Chương trình đang chạy bị sửa bất lợi | Hiếm | Mất niềm tin và tranh chấp giải thưởng | Khóa tiền thưởng, tiêu chí, thời gian; hủy đang chạy phải có lý do và thông báo |

## 10. Success Criteria (preliminary)

- 100% Court Credit ở trạng thái sử dụng được có tiền reserve 1:1.
- 0 booking làm Chủ sân bị giảm settlement vì người chơi dùng Court Credit.
- 100% reward thiếu tiền được ghi PENDING_FUNDING và cấp đúng thứ tự phát sinh.
- Hệ thống dừng reward mới ngay sau reward làm chạm một trong hai ngưỡng Pool.
- 100% kết quả không tranh chấp được tự chốt mà không cần Admin duyệt thủ công.
- 100% kết quả có khiếu nại được đóng băng rating và reward trước khi có quyết định cuối.
- 100% khai báo kết quả/sự cố hợp lệ có 1–3 ảnh đúng định dạng và được lưu qua các lần deploy.
- Người chơi luôn thấy rõ 1 Credit bằng 1.000đ, hạn 90 ngày và giới hạn dùng 50% trước khi xác nhận thanh toán.
- Bảng xếp hạng hiển thị đúng dải trình độ, thể thức, tỉnh/thành, tiền thưởng và thời gian còn lại.
- Chương trình đã công bố không thể bị giảm thưởng, đổi tiêu chí hoặc rút ngắn thời gian.
- Mỗi khoản trả thưởng tiền thật hoàn tất có thông tin người nhận và tham chiếu/bằng chứng chuyển tiền.

## 11. Open Questions

Không còn câu hỏi mở bắt buộc ở cấp brainstorm. Các giá trị tiền của ngưỡng an toàn và trần backlog là cấu hình bắt buộc của Admin, không dùng mặc định cứng cho mọi giai đoạn vận hành.

## 12. Next Steps

- `/urd matchmaking-passport`
- `/brd matchmaking-passport`
- `/prd-epic matchmaking-passport`
- `/prototype competitive-match-rewards --desktop`
