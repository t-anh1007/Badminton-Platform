import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { buildSepayPayInstruction } from './sepayPayInstruction.js';

function generateMatchCode(): string {
  // Mã nội dung chuyển khoản ngắn, dễ gõ tay — đủ ngẫu nhiên để duy nhất
  // trong phạm vi các intent đang pending (unique constraint CSDL vẫn là
  // hàng rào cuối).
  return `KLT${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/** FIN-02 bước 1-2 — Tạo yêu cầu nạp + sinh mã nội dung duy nhất. */
export async function createTopupIntent(userId: string, amount: bigint) {
  const matchCode = generateMatchCode();
  const intent = await prisma.paymentIntent.create({
    data: { userId, amount, method: 'sepay', refType: 'topup', refId: '', matchCode },
  });
  // refId tự trỏ về chính intent — topup không có đối tượng tham chiếu ngoài.
  await prisma.paymentIntent.update({ where: { id: intent.id }, data: { refId: intent.id } });
  return { intentId: intent.id, matchCode, amount: amount.toString(), payment: buildSepayPayInstruction(matchCode, amount) };
}
