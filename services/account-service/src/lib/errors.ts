export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** BR-ACC-10: thông báo đăng nhập/đặt lại mật khẩu không được tiết lộ email
 * có tồn tại hay không — dùng CHUNG một message cho mọi nhánh liên quan. */
export const GENERIC_AUTH_ERROR = 'Email hoặc mật khẩu không đúng.';
export const GENERIC_RESET_MESSAGE =
  'Nếu email tồn tại trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi.';
