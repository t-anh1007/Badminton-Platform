import { api } from './passportApi';
import { api as financeApi } from './financeApi';
import type { Discipline } from './passportApi';
import type { LeaderboardBand, LeaderboardScope } from './competitionApi';

export type RewardProgramStatus = 'scheduled' | 'active' | 'reconciling' | 'awaiting_admin_approval' | 'final' | 'cancelled';
export interface RewardProgram {
  id: string;
  name: string;
  seasonId: string;
  status: RewardProgramStatus;
  criterion: 'ending_rating' | 'most_wins' | 'largest_rating_gain' | 'longest_streak';
  criterionLabel: string;
  discipline: Discipline;
  band: LeaderboardBand;
  scope: LeaderboardScope;
  provinceCode: string | null;
  serverNow: string;
  startAt: string;
  endAt: string;
  reconciling: boolean;
  tiers: Array<{ rank: number; amount: string }>;
  viewer?: { rank: number; score: number } | null;
}

export type RewardPayoutStatus = 'awaiting_information' | 'ready_to_pay' | 'paid' | 'cancelled';
export interface RewardPayout {
  id: string;
  serverNow: string;
  programId: string;
  programName: string;
  achievementLabel: string;
  amount: string;
  status: RewardPayoutStatus;
  claimDeadlineAt: string;
  payoutDeadlineAt: string | null;
  informationComplete: boolean;
  paidAt: string | null;
  transactionReference: string | null;
  proofUrl?: string | null;
}
/** BR-CM-68: đúng bảy trường nhận thưởng. */
export interface PayoutInformation {
  recipientName: string;
  email: string;
  phone: string;
  address: string;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountName: string;
}

export const listRewardPrograms = () => api<{ items: RewardProgram[] }>('/rewards/programs');
export const getRewardProgram = (id: string) => api<{ program: RewardProgram }>(`/rewards/programs/${id}`);
export const listMyRewardPayouts = () => financeApi<{ items: RewardPayout[] }>('/rewards/players/me/payouts');
export const getMyRewardPayout = (id: string) => financeApi<{ payout: RewardPayout }>(`/rewards/players/me/payouts/${id}`);
export const submitPayoutInformation = (id: string, input: PayoutInformation) =>
  financeApi<{ payout: RewardPayout }>(`/rewards/players/me/payouts/${id}/information`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });

export const REWARD_STATUS_LABELS: Record<RewardProgramStatus, string> = {
  scheduled: 'Sắp diễn ra',
  active: 'Đang diễn ra',
  reconciling: 'Đang đối soát kết quả',
  awaiting_admin_approval: 'Chờ duyệt kết quả',
  final: 'Đã có kết quả',
  cancelled: 'Đã hủy',
};
export const PAYOUT_STATUS_LABELS: Record<RewardPayoutStatus, string> = {
  awaiting_information: 'Chờ bổ sung thông tin',
  ready_to_pay: 'Chờ chuyển thưởng',
  paid: 'Đã trả thưởng',
  cancelled: 'Đã hủy',
};

export interface AdminRewardProgram extends RewardProgram {
  locked: boolean; awardCount?: number; cancelReason?: string | null;
  awards?: Array<{ userId: string; displayName: string; avatarUrl: string | null; rank: number; score: number; amount: string }>;
  awardTotal?: string;
}
export interface NewRewardProgram {
  name: string; seasonId: string; criterion: RewardProgram['criterion']; discipline: Discipline; band: LeaderboardBand;
  scope: LeaderboardScope; provinceCode?: string; startAt: string; endAt: string;
  tiers: Array<{ rank: number; amount: string }>;
}
const post = (body: unknown = {}) => ({ method: 'POST', body: JSON.stringify(body) });
export const listAdminRewardPrograms = (page = 1) =>
  api<{ items: AdminRewardProgram[]; total: number; page: number; pageSize: number }>(`/rewards/admin/programs?${new URLSearchParams({ page: String(page), pageSize: '10' })}`);
export const getAdminRewardProgram = (id: string) => api<{ program: AdminRewardProgram }>(`/rewards/admin/programs/${id}`);
export const createRewardProgram = (body: NewRewardProgram) => api<{ program: AdminRewardProgram }>('/rewards/admin/programs', post(body));
export const publishRewardProgram = (id: string) => api<{ program: AdminRewardProgram }>(`/rewards/admin/programs/${id}/publish`, post());
export const cancelRewardProgram = (id: string, reason?: string) => api<{ program: AdminRewardProgram }>(`/rewards/admin/programs/${id}/cancel`, post(reason ? { reason } : {}));
export const approveRewardProgramFinal = (id: string) => api<{ program: AdminRewardProgram }>(`/rewards/admin/programs/${id}/approve-final`, post({ confirm: true }));

/** Mục danh sách Admin: không có người nhận/ngân hàng/chứng từ. */
export interface AdminRewardPayoutListItem extends RewardPayout { overdue: boolean }
export interface AdminRewardPayout extends RewardPayout {
  userId: string;
  receiver: { [K in keyof PayoutInformation]: string | null };
  overdue: boolean;
  proof: null | { mimeType: string | null; size: number | null; checksumSha256: string | null };
  paidByUserId: string | null;
  cancelledAt: string | null;
}
export const listAdminRewardPayouts = (query: { page?: number; status?: RewardPayoutStatus; programId?: string } = {}) => {
  const params = new URLSearchParams({ page: String(query.page ?? 1), pageSize: '10' });
  if (query.status) params.set('status', query.status);
  if (query.programId) params.set('programId', query.programId);
  return financeApi<{ items: AdminRewardPayoutListItem[]; total: number; page: number; pageSize: number }>(`/rewards/admin/payouts?${params}`);
};
export const getAdminRewardPayout = (id: string) => financeApi<{ payout: AdminRewardPayout }>(`/rewards/admin/payouts/${id}`);
export async function authorizePayoutProof(mimeType: 'image/jpeg' | 'image/png' | 'image/webp', metadata?: { size: number; checksumSha256: string }) {
  if (!metadata) throw new Error('Cần mã kiểm tra ảnh trước khi tải lên.');
  return (await financeApi<{ upload: { objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string } }>(
    '/rewards/admin/uploads', post({ mimeType, ...metadata }),
  )).upload;
}
export const markRewardPayoutPaid = (id: string, body: { transactionReference: string; proofObjectKey: string }) =>
  financeApi<{ payout: AdminRewardPayout }>(`/rewards/admin/payouts/${id}/mark-paid`, post({ ...body, confirm: true }));
