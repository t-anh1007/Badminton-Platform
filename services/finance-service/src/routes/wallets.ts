import { Router } from 'express';
import { h } from './handler.js';
import { getWalletsForUser, getWalletLedger } from '../domain/wallet.js';
import { describeLedgerEntries } from '../domain/ledgerContext.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { PERSONAL_DAILY_FREE_WITHDRAWAL, personalWithdrawnToday } from '../domain/withdrawal.js';
import { prisma } from '../lib/prisma.js';

export const walletRouter = Router();

function serializeWallet(w: { id: string; walletType: string; available: bigint; pending: bigint; reserved: bigint; currency: string }) {
  return {
    id: w.id,
    walletType: w.walletType,
    available: w.available.toString(),
    pending: w.pending.toString(),
    reserved: w.reserved.toString(),
    currency: w.currency,
  };
}

function withDescription(stored: unknown, described?: { title?: string; subtitle?: string }) {
  const base = (stored ?? {}) as { title?: string; subtitle?: string };
  const title = described?.title ?? base.title;
  const subtitle = described?.subtitle ?? base.subtitle;
  return title || subtitle ? { ...base, title, subtitle } : stored ?? null;
}

// FIN-01
walletRouter.get(
  '/wallets/me',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const wallets = await getWalletsForUser(userId);
    // Ví người chơi: hạn mức rút miễn phí trong ngày; phần vượt chịu phí 1%.
    const withdrawnToday = wallets.some((w) => w.walletType === 'personal') ? await personalWithdrawnToday(prisma, userId) : 0n;
    res.status(200).json(wallets.map((w) => (w.walletType === 'personal'
      ? { ...serializeWallet(w), dailyFreeWithdrawal: PERSONAL_DAILY_FREE_WITHDRAWAL.toString(), withdrawnToday: withdrawnToday.toString() }
      : serializeWallet(w))));
  }),
);

walletRouter.get(
  '/wallets/:id/ledger',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { wallet, entries } = await getWalletLedger(userId, req.params.id!);
    const described = await describeLedgerEntries(entries, wallet.walletType, wallet.userId);
    res.status(200).json({
      wallet: serializeWallet(wallet),
      entries: entries.map((e) => ({
        id: e.id,
        amount: e.amount.toString(),
        type: e.type,
        refType: e.refType,
        refId: e.refId,
        // Tiêu đề/mô tả tính lúc đọc để cả bút toán cũ cũng rõ kèo/booking nào.
        referenceSummary: withDescription(e.referenceSummary, described.get(e.id)),
        before: e.before.toString(),
        after: e.after.toString(),
        ts: e.ts,
      })),
    });
  }),
);
