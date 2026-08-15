import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Xác thực chữ ký webhook SePay theo HMAC-SHA256 (tài liệu chính thức SePay).
 *
 * SePay ghép `{timestamp}.{raw_body}`, ký bằng Secret Key, gửi kết quả qua
 * header `X-SePay-Signature: sha256=<hex>` kèm `X-SePay-Timestamp: <unix_seconds>`.
 * Server tính lại trên ĐÚNG raw body nhận được rồi so khớp an toàn theo thời gian.
 *
 * @returns true nếu chữ ký hợp lệ.
 */
export function verifySepaySignature(params: {
  rawBody: Buffer | string;
  timestamp: string | undefined;
  signature: string | undefined;
  secret: string;
}): boolean {
  const { rawBody, timestamp, signature, secret } = params;
  if (!timestamp || !signature) return false;
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  // timingSafeEqual ném lỗi nếu khác độ dài → so độ dài trước, coi như không khớp.
  return provided.length === computed.length && timingSafeEqual(provided, computed);
}
