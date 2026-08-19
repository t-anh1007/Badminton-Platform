import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { DEMO_USER_ID, DEMO_EMAIL } from '@khoaluantn/shared';

/** Seed tài khoản demo (Test demo / Vãng lai) — player đã xác minh + hồ sơ.
 * Idempotent: upsert theo id cố định. Chạy qua `npm run seed:demo`. */
async function main(): Promise<void> {
  const passwordHash = await hashPassword('demo-seed-not-usable-1A');

  // Dọn user demo cũ (id ngẫu nhiên từ demoLogin trước khi cố định id) trùng
  // email để upsert theo id cố định không vướng ràng buộc unique email.
  const stale = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (stale && stale.id !== DEMO_USER_ID) {
    await prisma.playerProfile.deleteMany({ where: { userId: stale.id } });
    await prisma.verification.deleteMany({ where: { userId: stale.id } });
    await prisma.outbox.deleteMany({ where: { aggregateId: stale.id } });
    await prisma.user.delete({ where: { id: stale.id } });
    console.log('[seed:demo][account] removed stale demo user', stale.id);
  }

  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: { id: DEMO_USER_ID, email: DEMO_EMAIL, passwordHash, roles: ['player'], verified: true, status: 'active' },
    update: { email: DEMO_EMAIL, roles: ['player'], verified: true, status: 'active' },
  });

  await prisma.playerProfile.upsert({
    where: { userId: DEMO_USER_ID },
    create: { userId: DEMO_USER_ID, displayName: 'Khách demo', visibility: 'public' },
    update: { displayName: 'Khách demo' },
  });

  console.log('[seed:demo][account] user + profile ready:', DEMO_USER_ID);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => { console.error('[seed:demo][account]', err); await prisma.$disconnect(); process.exit(1); });
