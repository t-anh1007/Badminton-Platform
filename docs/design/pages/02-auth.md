---
type: page-design
page: auth
phase: GĐ1
milestone: P25-1 (modal), P25-3 (verify/reset)
route: modal toàn cục · /verify-email · /reset-password
updated: 2026-08-09
---

# Đăng nhập / Đăng ký / Xác minh / Đổi mật khẩu

## Tham chiếu Playo
Playo dùng **modal 2 nửa**: nửa trái minh hoạ (bản đồ + avatar người chơi + bong
bóng chat "Wanna play today?"), nửa phải form ("Login / Sign Up", nhập số điện
thoại → Send OTP, hoặc Email / Google). Modal nổi trên trang hiện tại, đóng bằng X.

## Đối chiếu scope
- Dự án dùng **email/mật khẩu** (ACC-01/03) + **xác minh email** (ACC-02) +
  **đặt lại/đổi mật khẩu** (ACC-05/06). **Không** có OTP SMS, **không** social
  login nếu backend chưa hỗ trợ → chỉ giữ phương thức API hiện có.
- Giữ **bố cục modal 2 nửa** của Playo; nửa minh hoạ vẽ lại theo chủ đề cầu lông
  (sân + quả cầu + avatar, tự tạo — không copy ảnh Playo).
- `AuthPage`/`AuthForm` hiện có → chuyển thành **modal** dùng chung (mở từ Navbar
  và từ các CTA cần đăng nhập). Có thể giữ route `/auth` như fallback full-page.

## Bố cục

### Auth modal (đăng nhập ⇄ đăng ký)
- Overlay tối; hộp trắng radius 16, 2 nửa (desktop), 1 cột (mobile ẩn nửa minh hoạ).
- **Nửa trái (minh hoạ):** nền `green-500`, illustration cầu lông + vài avatar +
  bong bóng thoại tiếng Việt ("Rảnh chiều nay không?", "Kiếm kèo nào!").
- **Nửa phải (form):** tiêu đề "Đăng nhập / Đăng ký" + X đóng. Tab hoặc toggle
  Đăng nhập | Đăng ký.
  - Đăng nhập: Email, Mật khẩu, link "Quên mật khẩu?", nút primary "Đăng nhập".
  - Đăng ký: Tên hiển thị, Email, Mật khẩu (+ gợi ý mạnh/yếu), nút "Tạo tài khoản".
  - (Nếu có Google OAuth backend) nút "Tiếp tục với Google" dưới divider "hoặc".
- Lỗi field dưới input (`danger`); lỗi chung dạng banner đỏ nhạt trên form.

### Xác minh email — `/verify-email`
- Trang gọn 1 cột giữa: card trắng, icon phong bì, "Xác minh email của bạn", trạng
  thái: đang xác minh (spinner) → thành công (tick xanh + CTA vào trang chủ) → lỗi
  (token hết hạn + nút "Gửi lại email").

### Đặt lại / Đổi mật khẩu — `/reset-password`
- Yêu cầu reset: nhập email → "Gửi liên kết". Đặt mật khẩu mới: mật khẩu + xác nhận.
- Đổi mật khẩu (trong Profile, đã đăng nhập): mật khẩu hiện tại + mới + xác nhận.

## Component dùng
Modal, Tabs/Toggle, Input (password có toggle hiện/ẩn), Button, Toast, EmptyState
(cho verify lỗi), illustration SVG tự tạo.

## Nối API thật
Dùng `accountApi` hiện có: đăng ký, đăng nhập (lưu `accessToken`), xác minh email,
đặt lại/đổi mật khẩu. Không thêm phương thức xác thực mới ngoài API sẵn có.

## Trạng thái
- Loading: nút spinner + disable form.
- Error: sai mật khẩu, email tồn tại, token hết hạn — thông báo tiếng Việt rõ.
- Success: đóng modal + toast; verify → chuyển hướng có CTA.
- Auth: đã đăng nhập mà mở modal → điều hướng về trang trước / Hồ sơ.

## Motion
Modal fade overlay + scale 0.98→1 (180ms); chuyển tab đăng nhập/đăng ký fade-slide
nhẹ; tick success scale-in.

## Tiêu chí đạt (AC-UI)
1. Modal 2 nửa desktop, 1 cột mobile; đóng bằng X / nền / `Esc`; bẫy focus.
2. Chỉ phương thức xác thực dự án hỗ trợ (email/mật khẩu, +Google nếu có). Không OTP SMS giả.
3. Toggle Đăng nhập/Đăng ký mượt; lỗi field + lỗi chung hiển thị đúng.
4. `/verify-email` và `/reset-password` đủ 3 trạng thái (đang xử lý/thành công/lỗi).
5. Nối `accountApi` thật; token lưu đúng; điều hướng sau đăng nhập đúng.
