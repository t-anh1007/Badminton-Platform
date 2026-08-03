# REPORT SPEC - KIỂM KÊ CHỨC NĂNG VÀ TẠO BÁO CÁO ĐỀ TÀI

Tài liệu này quy định đúng **hai phần đầu ra** cho quá trình phân tích và lập báo cáo đề tài nền tảng cầu lông. Không tạo thêm phần đầu ra, sơ đồ, tài liệu thiết kế hoặc tệp trung gian ngoài những nội dung được quy định dưới đây.

Nguồn thông tin được phép sử dụng:

- Kết quả Product Discovery và các nội dung đã được người dùng xác nhận.
- `D:\Khoaluantn\Bao_cao_khao_sat_Pengo.docx`.
- `D:\Khoaluantn\Bao_cao_khao_sat_GiaoLuuCauLong_so_sanh_Pengo.docx`.
- Các tài liệu dự án khác do người dùng cung cấp hoặc chỉ định.

Không tự bịa dữ liệu còn thiếu. Nội dung chưa đủ căn cứ phải được ghi rõ là **Giả định** hoặc **Câu hỏi cần xác nhận**.

## PHẦN 1 - KIỂM KÊ, ĐẾM VÀ ƯU TIÊN CHỨC NĂNG/USE CASE

### 1.1. Mục tiêu

Phần 1 phải giúp người dùng và giáo viên nhìn thấy đầy đủ phạm vi chức năng của hệ thống, số lượng Use Case cần đặc tả và thứ tự nên thực hiện. Đầu ra của Phần 1 được trình bày trực tiếp để người dùng review, chưa tạo file DOCX.

### 1.2. Danh mục toàn bộ chức năng

Liệt kê toàn bộ chức năng dự kiến của hệ thống và nhóm theo module hoặc phân hệ phù hợp.

Mỗi chức năng phải có tối thiểu các thông tin:

- Mã chức năng.
- Tên chức năng.
- Module/phân hệ.
- Tác nhân sử dụng.
- Mô tả ngắn về mục đích hoặc vấn đề được giải quyết.
- Trạng thái: Đã xác nhận, Giả định hoặc Cần làm rõ.
- Có cần viết Use Case Specification hay không.
- Mã Use Case tương ứng, nếu có.

Sau danh mục phải tổng hợp rõ:

- **Tổng số chức năng của toàn hệ thống.**
- Số chức năng theo từng module/phân hệ.
- Số chức năng đã xác nhận.
- Số chức năng đang là giả định hoặc cần làm rõ.

Không tính trùng một chức năng chỉ vì nhiều tác nhân cùng sử dụng. Nếu một chức năng chứa nhiều mục tiêu nghiệp vụ độc lập, phải tách thành các chức năng riêng trước khi đếm.

### 1.3. Danh sách Use Case cần đặc tả

Từ danh mục chức năng, xác định toàn bộ Use Case cần viết đặc tả. Mỗi Use Case phải có tối thiểu:

- Mã Use Case.
- Tên Use Case.
- Tác nhân chính.
- Tác nhân phụ, nếu có.
- Chức năng/module liên quan.
- Mục tiêu nghiệp vụ ngắn gọn.
- Mức độ ưu tiên.
- Lý do cần hoặc không cần viết đặc tả chi tiết.

Sau danh sách phải nêu rõ:

- **Tổng số Use Case của hệ thống.**
- **Tổng số Use Case Specification cần viết.**
- Số Use Case cần viết theo từng module/phân hệ.
- Những chức năng không cần Use Case Specification và lý do loại trừ, ví dụ: tác vụ kỹ thuật nội bộ, tra cứu quá đơn giản hoặc chức năng đã được bao phủ hợp lý bởi Use Case khác.

Mỗi Use Case phải truy vết được về ít nhất một chức năng. Không mặc định mỗi chức năng tương ứng đúng một Use Case; phải tách hoặc gộp theo mục tiêu của tác nhân và ranh giới nghiệp vụ thực tế.

### 1.4. Xác định chức năng và Use Case cốt lõi

Chọn và đánh dấu rõ hai nhóm ưu tiên:

1. **Nhóm cần báo cáo với giáo viên trước:** các chức năng thể hiện rõ bài toán, giá trị của đề tài và hành trình nghiệp vụ chính.
2. **Nhóm cần viết Use Case Specification trước:** các Use Case cốt lõi, có nhiều quy tắc nghiệp vụ, nhiều nhánh xử lý, nhiều tác nhân hoặc là nền tảng cho các Use Case khác.

Việc xếp hạng phải dựa trên các tiêu chí:

- Mức độ quan trọng đối với mục tiêu đề tài.
- Giá trị mang lại cho người dùng hoặc nghiệp vụ.
- Khả năng thể hiện điểm cốt lõi/khác biệt của hệ thống khi báo cáo giáo viên.
- Mức độ phụ thuộc của các chức năng khác.
- Độ phức tạp của quy trình và quy tắc nghiệp vụ.
- Rủi ro nếu hiểu sai hoặc đặc tả muộn.
- Khả năng tạo thành một hành trình end-to-end có thể trình bày và đánh giá.

Với từng chức năng hoặc Use Case cốt lõi, phải ghi:

- Mức ưu tiên: P0 - Cốt lõi, P1 - Quan trọng hoặc P2 - Bổ sung.
- Lý do xếp hạng.
- Thứ tự đề xuất để báo cáo hoặc viết đặc tả.
- Phụ thuộc cần hoàn thành trước, nếu có.

Cuối Phần 1 phải có bảng tổng kết ngắn gọn gồm:

- Tổng số chức năng.
- Tổng số Use Case.
- Tổng số Use Case Specification cần viết.
- Số chức năng cốt lõi cần báo cáo giáo viên trước.
- Số Use Case cốt lõi cần đặc tả trước.
- Danh sách ưu tiên theo thứ tự đề xuất.
- Các giả định và câu hỏi còn mở có thể làm thay đổi số lượng hoặc mức ưu tiên.

### 1.5. Cổng phê duyệt bắt buộc

**Phải dừng ngay sau khi hoàn thành Phần 1 và yêu cầu người dùng review.**

Tại thời điểm này:

- Không được tiếp tục Phần 2.
- Không được tạo file DOCX.
- Không được tự xem sự im lặng hoặc phản hồi mơ hồ là phê duyệt.
- Chỉ được sửa và trình lại Phần 1 nếu người dùng yêu cầu thay đổi.
- Chỉ được bắt đầu Phần 2 khi người dùng xác nhận rõ ràng rằng Phần 1 đã được duyệt và cho phép tiếp tục.

## PHẦN 2 - TẠO BÁO CÁO DOCX

### 2.1. Điều kiện bắt đầu

Chỉ thực hiện Phần 2 sau khi người dùng đã phê duyệt Phần 1. Danh mục chức năng, Use Case, tác nhân và thứ tự ưu tiên đã duyệt là cơ sở để viết báo cáo; không tự ý mở rộng phạm vi trong khi tạo DOCX.

### 2.2. File đầu ra

Tạo đúng một file:

`D:\Khoaluantn\Bao_cao_Phan_tich_De_tai.docx`

Chỉ bàn giao file DOCX cuối cùng. Không bàn giao mã tạo tài liệu, PDF, PNG, ảnh render hoặc tệp trung gian.

### 2.3. Nội dung bắt buộc

File DOCX phải gồm các nội dung sau, theo đúng thứ tự:

#### 1. Giới thiệu đề tài

- Bối cảnh hình thành đề tài.
- Vấn đề thực tế cần giải quyết.
- Tổng quan ngắn gọn về hệ thống được đề xuất.
- Nhóm người dùng chính và giá trị dự kiến của đề tài.

#### 2. Mục đích đề tài

- Mục đích tổng quát.
- Các mục tiêu nghiệp vụ cụ thể.
- Giá trị dự kiến đối với từng nhóm người dùng chính.
- Kết quả mà đề tài hướng tới.

Không viết mục tiêu chung chung hoặc không liên quan đến phạm vi đã duyệt.

#### 3. Phạm vi của đề tài

- Đối tượng sử dụng.
- Nghiệp vụ được hỗ trợ.
- Chức năng nằm trong phạm vi.
- Chức năng nằm ngoài phạm vi, nếu đã xác định.
- Giới hạn về dữ liệu, kỹ thuật, địa lý hoặc triển khai nếu đã được xác nhận.
- Các giả định và ràng buộc có ảnh hưởng trực tiếp đến phạm vi.

Phạm vi trong báo cáo phải nhất quán với Phần 1 đã được phê duyệt.

#### 4. Khảo sát các hệ thống liên quan

Khảo sát và trình bày riêng:

- Pengo.
- GiaoLuuCauLong.com.

Với mỗi hệ thống, trình bày:

- Tổng quan.
- Đối tượng phục vụ.
- Chức năng nổi bật.
- Điểm mạnh.
- Hạn chế.
- Nội dung có thể học hỏi hoặc điều chỉnh cho đề tài.

Sau đó có phần so sánh Pengo, GiaoLuuCauLong.com và hệ thống đề xuất, đồng thời chỉ ra khoảng trống hoặc cơ hội khác biệt. Các báo cáo khảo sát là nguồn tham khảo, không được biến toàn bộ chức năng của hệ thống được khảo sát thành yêu cầu bắt buộc của đề tài.

#### 5. Mô tả bài toán

- Hiện trạng và khó khăn của các nhóm người dùng.
- Nguyên nhân hoặc hạn chế của cách xử lý hiện tại.
- Nhu cầu cần được đáp ứng.
- Bài toán mà hệ thống phải giải quyết.
- Kết quả mong đợi khi áp dụng hệ thống.

Phân biệt rõ sự thật đã xác nhận, nhận định từ tài liệu khảo sát và giả định của đề tài.

#### 6. Mô tả quy trình nghiệp vụ liên quan của các chức năng

Mô tả các quy trình nghiệp vụ liên quan đến những chức năng đã được duyệt ở Phần 1, ưu tiên các chức năng cốt lõi trước.

Mỗi quy trình phải có tối thiểu:

- Tên quy trình.
- Mục tiêu.
- Tác nhân tham gia.
- Sự kiện bắt đầu.
- Điều kiện cần trước khi thực hiện.
- Các bước nghiệp vụ chính theo đúng thứ tự.
- Các nhánh thay thế hoặc trường hợp ngoại lệ quan trọng.
- Kết quả đầu ra.
- Trạng thái hoặc dữ liệu bị thay đổi.
- Chức năng và Use Case liên quan.

Chỉ mô tả bằng văn bản, danh sách bước hoặc bảng khi phù hợp. **Không tạo hoặc chèn sơ đồ, hình ảnh, Mermaid, PlantUML, BPMN hay các dạng hình minh họa khác.**

#### 7. Danh sách các tác nhân

Liệt kê toàn bộ tác nhân đã được xác định từ phạm vi và chức năng đã duyệt. Với mỗi tác nhân, ghi:

- Mã tác nhân.
- Tên tác nhân.
- Loại tác nhân: người dùng, hệ thống nội bộ hoặc hệ thống bên ngoài.
- Mô tả ngắn.
- Mục tiêu chính khi tương tác với hệ thống.

Không tạo hai tác nhân khác nhau nếu chúng chỉ là hai tên gọi của cùng một vai trò nghiệp vụ.

#### 8. Vai trò và đặc quyền của từng tác nhân

Với mỗi tác nhân, mô tả:

- Vai trò và trách nhiệm.
- Chức năng được phép sử dụng.
- Dữ liệu được phép xem.
- Dữ liệu hoặc trạng thái được phép tạo, sửa, phê duyệt, từ chối hoặc xóa.
- Giới hạn phạm vi thao tác.
- Điều kiện hoặc quy tắc cấp quyền đặc biệt, nếu có.
- Những hành động không được phép thực hiện.

Phần đặc quyền phải nhất quán với danh mục chức năng và quy trình nghiệp vụ. Không tự suy diễn quyền chưa được xác nhận; ghi rõ là giả định hoặc câu hỏi cần xác nhận nếu thiếu căn cứ.

### 2.4. Yêu cầu về tính chính xác và truy vết

- Nội dung DOCX phải dựa trên Phần 1 đã được duyệt và các tài liệu nguồn.
- Tên chức năng, Use Case và tác nhân phải nhất quán trong toàn bộ tài liệu.
- Mỗi quy trình nghiệp vụ phải liên kết được với chức năng và Use Case liên quan.
- Mỗi đặc quyền phải gắn với một tác nhân và chức năng cụ thể.
- Không đưa Use Case Specification chi tiết vào file DOCX này.
- Không bổ sung thiết kế cơ sở dữ liệu, kiến trúc, API, giao diện, kế hoạch triển khai hoặc nội dung ngoài danh sách bắt buộc nếu người dùng không yêu cầu riêng.
- Nội dung chưa được xác nhận phải được đánh dấu rõ, không trình bày như sự thật.

### 2.5. Định dạng DOCX

Áp dụng định dạng báo cáo học thuật thống nhất:

- Khổ giấy A4, hướng dọc.
- Lề trái 3 cm; lề phải 2 cm; lề trên 2 cm; lề dưới 2 cm.
- Font Times New Roman.
- Nội dung cỡ chữ 13 pt.
- Giãn dòng 1.5.
- Căn đều hai lề đối với đoạn nội dung.
- Tiêu đề tài liệu cỡ 16 pt, in đậm, căn giữa.
- Tiêu đề mục được phân cấp rõ ràng bằng Heading 1, Heading 2 và Heading 3.
- Đánh số đề mục nhất quán.
- Có mục lục tự động và số trang.
- Bảng phải có tiêu đề, hàng tiêu đề rõ ràng và lặp lại khi bảng kéo dài qua nhiều trang.
- Không để nội dung hoặc bảng tràn lề, bị cắt hoặc khó đọc.

Ưu tiên tốc độ và độ chính xác của nội dung. Theo yêu cầu của người dùng, **không thực hiện bước render DOCX thành hình ảnh và không kiểm tra trực quan bằng PNG/PDF**. Chỉ kiểm tra cấu trúc file, khả năng mở file, thứ tự nội dung, định dạng cơ bản, tính nhất quán và việc không thiếu các mục bắt buộc trước khi bàn giao.
