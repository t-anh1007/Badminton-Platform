import { publishDataInvalidation } from '../realtime/dataInvalidation.js';
const BASE_URL = import.meta.env.VITE_FINANCE_URL ?? '/api/finance';

function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý yêu cầu tài chính.');
  if (init?.method && init.method !== 'GET') publishDataInvalidation();
  return body;
}

export interface RevenueRow {
  bookingId: string;
  venueId: string;
  gross: string;
  net: string;
  commission: string;
  releaseAt: string;
  releasedAt: string | null;
  disputeOpen: boolean;
}
export interface WithdrawalRow {
  id: string;
  sellerUserId: string;
  walletType: 'personal' | 'business';
  amount: string;
  paidAmount: string;
  status: string;
  transferCode: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
  rejectionReason?: string | null;
  createdAt?: string;
  processedAt?: string | null;
}

export type FinanceUiScope = 'wallet' | 'revenue' | 'ledger' | 'withdrawals';

export async function streamMyFinance(
  signal: AbortSignal,
  onInvalidated: (scopes: FinanceUiScope[]) => void,
  onReady: () => void,
): Promise<void> {
  const token = accessToken();
  const response = await fetch(`${BASE_URL}/providers/me/finance-stream`, {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal,
  });
  if (!response.ok || !response.body) throw new Error('Không thể kết nối cập nhật trực tiếp.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) throw new Error('Kết nối cập nhật trực tiếp đã đóng.');
      buffer += decoder.decode(next.value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        const event = frame.match(/^event: (.+)$/m)?.[1];
        if (event === 'ready') onReady();
        if (event === 'finance-invalidated') {
          const data = frame.match(/^data: (.+)$/m)?.[1];
          try {
            const parsed = JSON.parse(data ?? '{}') as { scopes?: unknown };
            if (Array.isArray(parsed.scopes)) {
              onInvalidated(parsed.scopes.filter((scope): scope is FinanceUiScope =>
                scope === 'wallet' || scope === 'revenue' || scope === 'ledger' || scope === 'withdrawals'));
            }
          } catch { /* Ignore malformed transient frames and wait for the next authoritative refresh. */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
export interface ReconciliationRow {
  id: string;
  direction: 'in' | 'out';
  amount: string;
  rawRef: string;
  receivedAt: string;
}
export interface WalletRow {
  id: string;
  walletType: string;
  available: string;
  withdrawable: string;
  pending: string;
  reserved: string;
  currency: string;
}
export interface WalletLedgerEntry {
  id: string;
  amount: string;
  type: string;
  refType: string;
  refId: string;
  referenceSummary?: { kind: 'booking' | 'topup' | 'withdrawal' | 'match'; title: string; subtitle?: string } | null;
  before: string;
  after: string;
  ts: string;
}
export interface WalletLedgerResult {
  wallet: WalletRow;
  entries: WalletLedgerEntry[];
}
export interface DisputeEligibleRow {
  bookingId: string;
  venueId: string;
  gross: string;
  endAt: string;
  deadlineAt: string;
}
export interface DisputeRow {
  id: string;
  bookingId: string;
  raiserUserId: string;
  reason: string;
  contactPhone: string | null;
  evidence: string[];
  status: 'open' | 'resolved';
  resolution: 'full_refund' | 'partial_refund' | 'rejected' | null;
  resolutionAmount: string | null;
  deadlineAt: string;
  createdAt: string;
  resolvedAt: string | null;
  revenue?: {
    gross: string;
    net: string;
    commission: string;
    endAt: string;
    releaseAt: string;
    releasedAt: string | null;
  } | null;
  ledgerEntries?: Array<{
    id: string;
    amount: string;
    type: string;
    refType: string;
    refId: string;
    before: string;
    after: string;
    ts: string;
    wallet: { walletType: string; userId: string | null };
  }>;
}

export interface SepayPayInstruction {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: string;
  matchCode: string;
  qrImageUrl: string;
}
export interface SepayIntent {
  intentId: string;
  matchCode: string;
  amount: string;
  payment: SepayPayInstruction;
}

export const getMyWallets = () => api<WalletRow[]>('/wallets/me');
export const getWalletLedger = (walletId: string) => api<WalletLedgerResult>(`/wallets/${walletId}/ledger`);
export const createTopupIntent = (amount: string) =>
  api<SepayIntent>('/wallet/topup-intents', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
export const payBookingBalance = (bookingId: string) =>
  api<{ message: string }>(`/bookings/${bookingId}/pay/balance`, {
    method: 'POST',
  });
export const createBookingSepayIntent = (bookingId: string) =>
  api<SepayIntent>(`/bookings/${bookingId}/pay/sepay`, { method: 'POST' });
export const payMatchJoinBalance = (matchId: string, joinId: string) =>
  api<{ message: string }>(`/matches/${matchId}/joins/${joinId}/pay/balance`, {
    method: 'POST',
  });
export const createMatchJoinSepayIntent = (matchId: string, joinId: string) =>
  api<SepayIntent>(`/matches/${matchId}/joins/${joinId}/pay/sepay`, {
    method: 'POST',
  });
export const payMatchOrganizerContributionBalance = (matchId: string) =>
  api<{ message: string }>(`/matches/${matchId}/organizer-contribution/pay/balance`, { method: 'POST' });
export const createMatchOrganizerContributionSepayIntent = (matchId: string) =>
  api<SepayIntent>(`/matches/${matchId}/organizer-contribution/pay/sepay`, {
    method: 'POST',
  });
export const getMyRevenue = (filters?: { venueId?: string; from?: string; to?: string }) => {
  const query = new URLSearchParams(
    Object.entries(filters ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return api<RevenueRow[]>(`/providers/me/revenue${query.size ? `?${query}` : ''}`);
};
export const getMyWithdrawals = () => api<WithdrawalRow[]>('/providers/me/withdrawals');
export const createWithdrawal = (body: {
  amount: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
}) =>
  api<WithdrawalRow>('/providers/me/withdrawals', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const cancelMyWithdrawal = (id: string) => api(`/providers/me/withdrawals/${id}/cancel`, { method: 'POST' });
export const getMyPersonalWithdrawals = () => api<WithdrawalRow[]>('/players/me/withdrawals');
export const createPersonalWithdrawal = (body: { amount: string; bankCode: string; bankAccountNumber: string; bankAccountName: string }) =>
  api<WithdrawalRow>('/players/me/withdrawals', { method: 'POST', body: JSON.stringify(body) });
export const cancelMyPersonalWithdrawal = (id: string) => api(`/players/me/withdrawals/${id}/cancel`, { method: 'POST' });
export const getAdminWithdrawals = () => api<WithdrawalRow[]>('/admin/withdrawals');
export const rejectWithdrawal = (id: string, reason: string) =>
  api(`/admin/withdrawals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const confirmManualWithdrawalPayout = (id: string, reason: string) =>
  api(`/admin/withdrawals/${id}/manual-payout`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const finalizePartialWithdrawal = (id: string, reason: string) =>
  api(`/admin/withdrawals/${id}/finalize-partial`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const getReconciliationQueue = () => api<ReconciliationRow[]>('/admin/reconciliation');
export const reconcileIncoming = (id: string, userId: string, reason: string) =>
  api(`/admin/reconciliation/${id}/incoming`, {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  });
export const reconcileOutgoing = (id: string, withdrawalRequestId: string, reason: string) =>
  api(`/admin/reconciliation/${id}/outgoing`, {
    method: 'POST',
    body: JSON.stringify({ withdrawalRequestId, reason }),
  });
export const markOutOfScope = (id: string, reason: string) =>
  api(`/admin/reconciliation/${id}/out-of-scope`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
export const getEligibleDisputeBookings = () => api<DisputeEligibleRow[]>('/players/me/dispute-eligible');
export const getMyDisputes = () => api<DisputeRow[]>('/players/me/disputes');
export interface DisputeEvidenceUploadAuthorization {
  objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string;
}
export const authorizeDisputeEvidence = (mimeType: 'image/jpeg' | 'image/png' | 'image/webp') =>
  api<DisputeEvidenceUploadAuthorization>('/players/me/dispute-evidence-upload', { method: 'POST', body: JSON.stringify({ mimeType }) });
export async function uploadDisputeEvidence(authorization: DisputeEvidenceUploadAuthorization, file: File, onProgress?: (progress: number) => void) {
  onProgress?.(10);
  const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: file });
  if (!response.ok) throw new Error('Không thể tải ảnh bằng chứng lên.');
  onProgress?.(100);
}
export const createDispute = (body: { bookingId: string; reason: string; contactPhone: string; evidence: string[] }) =>
  api<DisputeRow>('/players/me/disputes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const getAdminDisputes = () => api<DisputeRow[]>('/admin/disputes');
export const resolveDispute = (
  id: string,
  body: {
    decision: 'full_refund' | 'partial_refund' | 'rejected';
    amount?: string;
    reason: string;
  },
) =>
  api<DisputeRow>(`/admin/disputes/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
