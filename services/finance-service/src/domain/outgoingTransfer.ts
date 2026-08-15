import { prisma } from '../lib/prisma.js';
import { settleWithdrawalPayout } from './withdrawal.js';

export interface OutgoingTransfer {
  externalRef: string;
  amount: bigint;
  rawRef: string;
}

export async function handleOutgoingTransfer(transfer: OutgoingTransfer): Promise<void> {
  if (transfer.amount <= 0n) throw new Error('Outgoing transfer amount phải dương');
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${transfer.externalRef}))) AS event_lock`;
    if (await tx.sepayEvent.findUnique({ where: { externalRef: transfer.externalRef } })) return;
    const request = await tx.withdrawalRequest.findUnique({ where: { transferCode: transfer.rawRef } });
    const remaining = request ? request.amount - (request.paidAmount ?? 0n) : null;
    if (!request || !['pending', 'partially_paid'].includes(request.status) || remaining !== transfer.amount) {
      await tx.sepayEvent.create({
        data: { direction: 'out', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef, status: 'unmatched' },
      });
      return;
    }
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${request.id}))) AS request_lock`;
    const fresh = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (!['pending', 'partially_paid'].includes(fresh.status) || fresh.amount - (fresh.paidAmount ?? 0n) !== transfer.amount) {
      await tx.sepayEvent.create({
        data: { direction: 'out', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef, status: 'unmatched' },
      });
      return;
    }
    const event = await tx.sepayEvent.create({
      data: {
        direction: 'out', amount: transfer.amount, rawRef: transfer.rawRef, externalRef: transfer.externalRef,
        status: 'matched_auto', matchedType: 'WithdrawalRequest', matchedId: fresh.id,
      },
    });
    const payout = await settleWithdrawalPayout(tx, fresh, transfer.amount, event.id);
    await tx.sepayAllocation.create({
      data: { sepayEventId: event.id, kind: 'payout', amount: transfer.amount, refId: payout.ledgerEntryId },
    });
  });
}
