import jwt from 'jsonwebtoken';
import { env } from './env.js';

// venue-booking-service KHÔNG ký token — chỉ xác minh token account-service đã
// cấp, dùng chung JWT_SECRET (biến môi trường gốc). Payload khớp
// account-service/src/lib/jwt.ts AccessTokenPayload.
export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  type: 'access';
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
  if (decoded.type !== 'access') throw new Error('Not an access token');
  return decoded;
}
