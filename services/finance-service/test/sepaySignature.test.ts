import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySepaySignature } from '../src/domain/sepaySignature.js';

const secret = 'whsec_test_secret';
function sign(raw: string, ts: string, key = secret) {
  return `sha256=${createHmac('sha256', key).update(`${ts}.${raw}`).digest('hex')}`;
}

describe('verifySepaySignature — HMAC-SHA256 theo tài liệu SePay', () => {
  const raw = JSON.stringify({ id: 1, transferType: 'in', transferAmount: 50000 });
  const ts = '1700000000';

  it('chấp nhận chữ ký hợp lệ', () => {
    expect(verifySepaySignature({ rawBody: raw, timestamp: ts, signature: sign(raw, ts), secret })).toBe(true);
  });

  it('từ chối khi thiếu chữ ký hoặc timestamp', () => {
    expect(verifySepaySignature({ rawBody: raw, timestamp: undefined, signature: sign(raw, ts), secret })).toBe(false);
    expect(verifySepaySignature({ rawBody: raw, timestamp: ts, signature: undefined, secret })).toBe(false);
  });

  it('từ chối khi secret sai', () => {
    expect(verifySepaySignature({ rawBody: raw, timestamp: ts, signature: sign(raw, ts, 'khac'), secret })).toBe(false);
  });

  it('từ chối khi body bị sửa sau khi ký', () => {
    const tampered = JSON.stringify({ id: 1, transferType: 'in', transferAmount: 999999 });
    expect(verifySepaySignature({ rawBody: tampered, timestamp: ts, signature: sign(raw, ts), secret })).toBe(false);
  });

  it('từ chối khi timestamp bị đổi (nằm trong chuỗi ký)', () => {
    expect(verifySepaySignature({ rawBody: raw, timestamp: '1700000001', signature: sign(raw, ts), secret })).toBe(false);
  });

  it('chấp nhận Buffer raw body', () => {
    expect(verifySepaySignature({ rawBody: Buffer.from(raw), timestamp: ts, signature: sign(raw, ts), secret })).toBe(true);
  });
});
