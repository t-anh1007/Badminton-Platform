const BASE_URL = import.meta.env.VITE_FINANCE_URL ?? '/api/finance';

function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý yêu cầu tài chính.');
  return body;
}

export interface RevenueRow {
  bookingId: string; venueId: string; gross: string; net: string; commission: string;
  releaseAt: string; releasedAt: string | null; disputeOpen: boolean;
}
export interface WithdrawalRow {
  id: string; sellerUserId: string; amount: string; paidAmount: string; status: string; transferCode: string;
  bankCode: string; bankAccountNumber: string; bankAccountName: string;
}
export interface ReconciliationRow {
  id: string; direction: 'in' | 'out'; amount: string; rawRef: string; receivedAt: string;
}
export interface WalletRow { id: string; walletType: string; available: string; pending: string; reserved: string; currency: string }

export const getMyWallets = () => api<WalletRow[]>('/wallets/me');
export const getMyRevenue = (filters?: { venueId?: string; from?: string; to?: string }) => {
  const query = new URLSearchParams(Object.entries(filters ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return api<RevenueRow[]>(`/providers/me/revenue${query.size ? `?${query}` : ''}`);
};
export const getMyWithdrawals = () => api<WithdrawalRow[]>('/providers/me/withdrawals');
export const createWithdrawal = (body: { amount: string; bankCode: string; bankAccountNumber: string; bankAccountName: string }) =>
  api<WithdrawalRow>('/providers/me/withdrawals', { method: 'POST', body: JSON.stringify(body) });
export const cancelMyWithdrawal = (id: string) => api(`/providers/me/withdrawals/${id}/cancel`, { method: 'POST' });
export const getAdminWithdrawals = () => api<WithdrawalRow[]>('/admin/withdrawals');
export const rejectWithdrawal = (id: string, reason: string) => api(`/admin/withdrawals/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const finalizePartialWithdrawal = (id: string, reason: string) => api(`/admin/withdrawals/${id}/finalize-partial`, { method: 'POST', body: JSON.stringify({ reason }) });
export const getReconciliationQueue = () => api<ReconciliationRow[]>('/admin/reconciliation');
export const reconcileIncoming = (id: string, userId: string, reason: string) => api(`/admin/reconciliation/${id}/incoming`, { method: 'POST', body: JSON.stringify({ userId, reason }) });
export const reconcileOutgoing = (id: string, withdrawalRequestId: string, reason: string) => api(`/admin/reconciliation/${id}/outgoing`, { method: 'POST', body: JSON.stringify({ withdrawalRequestId, reason }) });
export const markOutOfScope = (id: string, reason: string) => api(`/admin/reconciliation/${id}/out-of-scope`, { method: 'POST', body: JSON.stringify({ reason }) });
