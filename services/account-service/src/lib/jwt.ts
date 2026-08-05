import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from './env.js';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

export function signAccessToken(userId: string, roles: string[]): string {
  const payload: AccessTokenPayload = { sub: userId, roles, type: 'access' };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.accessTokenTtlSec });
}

/** Trả về cả token đã ký lẫn jti (để lưu vào allowlist Redis). */
export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = randomUUID();
  const payload: RefreshTokenPayload = { sub: userId, jti, type: 'refresh' };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.refreshTokenTtlSec });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
  if (decoded.type !== 'access') throw new Error('Not an access token');
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');
  return decoded;
}
