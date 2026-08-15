import type { NextFunction, Request, Response } from 'express';
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

export function requirePlayer(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('player')) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Chỉ người chơi được thao tác cộng đồng.' } });
    return;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles.includes('admin')) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Chỉ Admin được kiểm duyệt.' } });
    return;
  }
  next();
}
