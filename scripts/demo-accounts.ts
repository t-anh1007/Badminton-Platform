// Tạo tài khoản demo ngắn gọn cho từng role: admin / player / provider.
// Idempotent: chạy lại sẽ cập nhật, không tạo trùng. Xóa tay bằng email nếu cần.
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient as AccountPrismaClient, UserRole } from '../services/account-service/node_modules/@prisma/client/index.js';
import { PrismaClient as VenuePrismaClient } from '../services/venue-booking-service/node_modules/@prisma/client/index.js';

const accountDb = new AccountPrismaClient();
const venueDb = new VenuePrismaClient();

const PASSWORD = 'Demo@123456';

async function makeUser(email: string, displayName: string, roles: UserRole[]) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  return accountDb.user.upsert({
    where: { email },
    update: { passwordHash, roles, verified: true },
    create: {
      id: randomUUID(),
      email,
      passwordHash,
      roles,
      verified: true,
      playerProfile: { create: { displayName } },
    },
  });
}

async function main() {
  const admin = await makeUser('admin@demo.vn', 'Admin', [UserRole.player, UserRole.admin]);
  const player = await makeUser('player@demo.vn', 'Player', [UserRole.player]);
  const owner = await makeUser('owner@demo.vn', 'Chủ Sân', [UserRole.player, UserRole.provider]);

  // Provider record đã duyệt cho tài khoản owner (nếu chưa có)
  const existingProvider = await venueDb.provider.findFirst({ where: { userId: owner.id } });
  if (!existingProvider) {
    await venueDb.provider.create({ data: { userId: owner.id, orgName: 'Sân Demo', status: 'approved' } });
  }

  console.log(JSON.stringify({
    password: PASSWORD,
    admin: admin.email,
    player: player.email,
    provider: owner.email,
  }, null, 2));
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(async () => {
    await Promise.all([accountDb.$disconnect(), venueDb.$disconnect()]);
  });
