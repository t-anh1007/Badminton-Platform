import { isAccountLocked } from '@khoaluantn/eventbus';
import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { verifyAccessToken } from '../lib/jwt.js';

/** Chỉ service nội bộ (header x-internal-service-token) — giống venue-booking-service. */
export function requireInternalService(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const actual = req.header('x-internal-service-token');
  if (!expected) {
    res.status(503).json({ error: { code: 'INTERNAL_SERVICE_AUTH_UNCONFIGURED', message: 'Chưa cấu hình xác thực service nội bộ.' } });
    return;
  }
  if (!actual || actual.length !== expected.length
    || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    res.status(401).json({ error: { code: 'INTERNAL_SERVICE_UNAUTHORIZED', message: 'Không được phép gọi lệnh nội bộ.' } });
    return;
  }
  next();
}

export interface AuthenticatedRequest extends Request {
  user?: { id: string; roles: string[] };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Thiếu access token.' } });
    return;
  }
  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(header.slice('Bearer '.length));
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Access token không hợp lệ.' } });
    return;
  }
  // Khóa tài khoản có hiệu lực ngay, không chờ access token hết hạn (Redis lỗi thì cho qua).
  void isAccountLocked(payload.sub).then((locked) => {
    if (locked) {
      res.status(401).json({ error: { code: 'ACCOUNT_LOCKED', message: 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.' } });
      return;
    }
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  });
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

export function requirePlayer(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('player')) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Chỉ người chơi được thao tác hồ sơ trình độ.' } });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('admin')) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Chỉ Admin được duyệt đánh giá.' } });
    return;
  }
  next();
}

export function requireProvider(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('provider')) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Chỉ chủ sân được xem hồ sơ kết quả này.' } });
    return;
  }
  next();
}
