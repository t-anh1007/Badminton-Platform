import { Router } from 'express';
import { z } from 'zod';
import { h } from './handler.js';
import { registerUser } from '../domain/registration.js';
import { verifyEmailCode, resendVerificationCode } from '../domain/verification.js';
import { login, logout } from '../domain/session.js';
import { requestPasswordReset, resetPassword, changePassword } from '../domain/passwordReset.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  displayName: z.string(),
  phone: z.string().optional(),
});

authRouter.post(
  '/register',
  h(async (req, res) => {
    const input = registerSchema.parse(req.body);
    await registerUser(input);
    res.status(201).json({ message: 'Đã gửi mã xác minh tới email.' });
  }),
);

const verifySchema = z.object({ email: z.string().email(), code: z.string().length(6) });

authRouter.post(
  '/verify',
  h(async (req, res) => {
    const { email, code } = verifySchema.parse(req.body);
    await verifyEmailCode(email, code);
    res.status(200).json({ message: 'Xác minh thành công.' });
  }),
);

const resendSchema = z.object({ email: z.string().email() });

authRouter.post(
  '/verify/resend',
  h(async (req, res) => {
    const { email } = resendSchema.parse(req.body);
    await resendVerificationCode(email);
    res.status(200).json({ message: 'Nếu tài khoản hợp lệ, mã mới đã được gửi.' });
  }),
);

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post(
  '/login',
  h(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await login(email, password);
    res.status(200).json(result);
  }),
);

const logoutSchema = z.object({ refreshToken: z.string() });

authRouter.post(
  '/logout',
  h(async (req, res) => {
    const { refreshToken } = logoutSchema.parse(req.body);
    await logout(refreshToken);
    res.status(200).json({ message: 'Đã đăng xuất.' });
  }),
);

const forgotSchema = z.object({ email: z.string().email() });

authRouter.post(
  '/password/forgot',
  h(async (req, res) => {
    const { email } = forgotSchema.parse(req.body);
    await requestPasswordReset(email);
    res.status(200).json({ message: 'Nếu email tồn tại trong hệ thống, một liên kết đặt lại mật khẩu đã được gửi.' });
  }),
);

const resetSchema = z.object({ token: z.string(), newPassword: z.string() });

authRouter.post(
  '/password/reset',
  h(async (req, res) => {
    const { token, newPassword } = resetSchema.parse(req.body);
    await resetPassword(token, newPassword);
    res.status(200).json({ message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.' });
  }),
);

const changeSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string(),
  currentRefreshToken: z.string().optional(),
});

authRouter.post(
  '/password/change',
  requireAuth,
  h(async (req, res) => {
    const { currentPassword, newPassword, currentRefreshToken } = changeSchema.parse(req.body);
    const userId = (req as AuthenticatedRequest).user!.id;
    await changePassword(userId, currentPassword, newPassword, currentRefreshToken);
    res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
  }),
);
