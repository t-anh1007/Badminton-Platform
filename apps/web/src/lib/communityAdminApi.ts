const BASE_URL = import.meta.env.VITE_COMMUNITY_URL ?? '/api/community';
function token(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = token();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý kiểm duyệt.');
  return body;
}
export interface CommunityReport {
  id: string;
  reporterUserId: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
}
export const getOpenCommunityReports = () => api<{ reports: CommunityReport[] }>('/admin/reports');
export const moderateCommunityReport = (id: string, action: 'hide' | 'remove' | 'dismiss', reason: string) =>
  api<CommunityReport>(`/admin/reports/${id}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, reason }),
  });
