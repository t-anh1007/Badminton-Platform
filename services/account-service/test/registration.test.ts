import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { registerUser } from '../src/domain/registration.js';
import { AppError } from '../src/lib/errors.js';
import { uniqueEmail, VALID_PASSWORD } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('ACC-01 — Đăng ký tài khoản', () => {
  it('AC-ACC-01-1: email chưa tồn tại + mật khẩu hợp lệ -> tạo verified=false, status=active, roles={player}, gửi mã 6 số', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'Nguyen Van A' });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.verified).toBe(false);
    expect(user.status).toBe('active');
    expect(user.roles).toEqual(['player']);

    const verification = await prisma.verification.findFirst({ where: { userId } });
    expect(verification).not.toBeNull();
    expect(verification!.code).toMatch(/^\d{6}$/);
  });

  it('AC-ACC-01-2: email đã tồn tại -> từ chối, không tạo bản ghi mới', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
    const countBefore = await prisma.user.count({ where: { email } });

    await expect(
      registerUser({ email, password: VALID_PASSWORD, displayName: 'B' }),
    ).rejects.toThrow(AppError);

    const countAfter = await prisma.user.count({ where: { email } });
    expect(countAfter).toBe(countBefore);
    expect(countAfter).toBe(1);
  });

  it('AC-ACC-01-3: mật khẩu yếu -> từ chối kèm yêu cầu cụ thể', async () => {
    const email = uniqueEmail();
    await expect(registerUser({ email, password: 'short1', displayName: 'A' })).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    });
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  it('AC-ACC-01-4: mật khẩu lưu trong CSDL là chuỗi băm, không phải bản rõ', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: VALID_PASSWORD, displayName: 'A' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.passwordHash).not.toBe(VALID_PASSWORD);
    expect(user.passwordHash.startsWith('$2')).toBe(true); // bcrypt hash format
  });
});
