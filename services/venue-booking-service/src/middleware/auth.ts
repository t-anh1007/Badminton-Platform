import type { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { verifyAccessToken } from '../lib/jwt.js';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; roles: string[] };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Thiếu access token.' } });
    return;
  }
  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    res.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'Access token không hợp lệ.' } });
  }
}

export function requireRole(role: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user?.roles.includes(role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Không đủ quyền.' } });
      return;
    }
    next();
  };
}

/** D40: a mutating `/internal` command is not a browser/user endpoint. It is
 * fail-closed unless the caller presents the configured shared service secret.
 * Read-only internal snapshots deliberately retain their existing boundary. */
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
