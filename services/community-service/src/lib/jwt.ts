import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  sub: string;
  roles: string[];
  type: 'access';
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET must be configured.');
  const decoded = jwt.verify(token, secret) as AccessTokenPayload;
  if (decoded.type !== 'access' || !decoded.sub || !Array.isArray(decoded.roles)) {
    throw new Error('Not a valid access token.');
  }
  return decoded;
}
