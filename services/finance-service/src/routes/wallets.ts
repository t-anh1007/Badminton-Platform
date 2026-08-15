import { Router } from 'express';
import { h } from './handler.js';
import { getWalletsForUser, getWalletLedger } from '../domain/wallet.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

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

// FIN-01
walletRouter.get(
  '/wallets/me',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const wallets = await getWalletsForUser(userId);
    res.status(200).json(wallets.map(serializeWallet));
  }),
);

walletRouter.get(
  '/wallets/:id/ledger',
  requireAuth,
  h(async (req, res) => {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { wallet, entries } = await getWalletLedger(userId, req.params.id!);
    res.status(200).json({
      wallet: serializeWallet(wallet),
      entries: entries.map((e) => ({
        id: e.id,
        amount: e.amount.toString(),
        type: e.type,
        refType: e.refType,
        refId: e.refId,
        referenceSummary: e.referenceSummary,
        before: e.before.toString(),
        after: e.after.toString(),
        ts: e.ts,
      })),
    });
  }),
);
