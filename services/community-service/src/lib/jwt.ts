import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  sub: string;
  roles: string[];
  type: 'access';
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, process.env.JWT_SECRET ?? 'change-me-in-real-env') as AccessTokenPayload;
  if (decoded.type !== 'access' || !decoded.sub || !Array.isArray(decoded.roles)) {
    throw new Error('Not a valid access token.');
  }
  return decoded;
}
