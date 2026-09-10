import type { Prisma } from '@prisma/client';
import { writeOutbox } from '../lib/outbox.js';

export const financeUiScopes = ['wallet', 'revenue', 'ledger', 'withdrawals'] as const;
export type FinanceUiScope = (typeof financeUiScopes)[number];

export interface FinanceUiInvalidatedPayload {
  sellerUserId: string;
  scopes: FinanceUiScope[];
}

export async function writeFinanceUiInvalidation(
  tx: Prisma.TransactionClient,
  sellerUserId: string | null | undefined,
  scopes: readonly FinanceUiScope[],
  aggregateId: string,
): Promise<void> {
  const uniqueScopes = [...new Set(scopes)];
  if (!sellerUserId || uniqueScopes.length === 0) return;
  await writeOutbox(tx, {
    aggregateType: 'FinanceUi',
    aggregateId,
    eventType: 'FinanceUiInvalidated',
    payload: { sellerUserId, scopes: uniqueScopes } satisfies FinanceUiInvalidatedPayload,
  });
}
