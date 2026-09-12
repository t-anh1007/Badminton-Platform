import { publishDataInvalidation } from '../realtime/dataInvalidation.js';
const BASE_URL = import.meta.env.VITE_ACCOUNT_URL ?? '/api/account';
const token = () => typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể tải thông báo.');
  if (init?.method && init.method !== 'GET') publishDataInvalidation();
  return body;
}
export type NotificationRole = 'player' | 'provider' | 'admin';
export type NotificationItem = { id: string; targetRole: NotificationRole; category: string; kind: string; title: string; body: string; priority: 'action_required' | 'update'; entityType: string | null; entityId: string | null; actionKind: string | null; actionExpiresAt: string | null; readAt: string | null; createdAt: string };
export type NotificationPage = { items: NotificationItem[]; page: number; pageSize: number; totalItems: number; totalPages: number; unreadCount: number; roles: NotificationRole[] };
export const getRecentNotifications = () => api<{ items: NotificationItem[]; unreadCount: number }>('/notifications/recent?limit=20');
export const getNotifications = (params: { page: number; role?: string; unread?: boolean }) => api<NotificationPage>(`/notifications?${new URLSearchParams({ page: String(params.page), pageSize: '20', ...(params.role ? { role: params.role } : {}), ...(params.unread ? { unread: 'true' } : {}) })}`);
export const readNotification = (id: string) => api<{ unreadCount: number }>(`/notifications/${id}/read`, { method: 'POST' });
export const readAllNotifications = () => api<{ unreadCount: number }>('/notifications/read-all', { method: 'POST' });
export const getNotificationPreferences = () => api<{ items: { targetRole: NotificationRole; category: string; enabled: boolean }[] }>('/notifications/preferences');
export const saveNotificationPreference = (body: { targetRole: NotificationRole; category: string; enabled: boolean }) => api<typeof body>('/notifications/preferences', { method: 'PUT', body: JSON.stringify(body) });
export function openNotificationStream(
  onChange: () => void,
  onOpen?: () => void,
  onDisconnect?: () => void,
) {
  const controller = new AbortController();
  void fetch(`${BASE_URL}/notifications/stream`, { headers: token() ? { Authorization: `Bearer ${token()}` } : {}, signal: controller.signal }).then(async (response) => {
    if (!response.ok || !response.body) throw new Error('Không thể kết nối thông báo realtime.');
    onOpen?.();
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let boundary = pending.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf('\n\n');
        if (/^event: notification-changed$/m.test(frame)) {
          onChange();
          publishDataInvalidation('notification');
        }
      }
    }
  }).catch(() => undefined).finally(() => {
    if (!controller.signal.aborted) onDisconnect?.();
  });
  return () => controller.abort();
}
