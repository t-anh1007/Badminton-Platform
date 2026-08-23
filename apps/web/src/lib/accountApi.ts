const BASE_URL = import.meta.env.VITE_ACCOUNT_URL ?? '/api/account';

function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'Không thể xử lý tài khoản.');
  return body;
}

export interface SessionResult { accessToken: string; refreshToken: string; roles: string[] }
export interface ProfileResult {
  id: string; email: string; phone: string | null; roles: string[];
  playerProfile: { displayName: string; avatarUrl: string | null; visibility: 'public' | 'private' } | null;
}
export interface AdminAccountRow {
  id: string; email: string; displayName: string | null; status: 'active' | 'locked'; roles: string[];
}
export interface AvatarUploadAuthorization { objectKey: string; uploadUrl: string; headers: Record<string, string>; expiresAt: string }

export const register = (body: { email: string; password: string; displayName: string }) =>
  api<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
export const verifyEmail = (body: { email: string; code: string }) =>
  api<{ message: string }>('/auth/verify', { method: 'POST', body: JSON.stringify(body) });
export const resendVerificationEmail = (email: string) =>
  api<{ message: string }>('/auth/verify/resend', { method: 'POST', body: JSON.stringify({ email }) });
export const login = (body: { email: string; password: string }) =>
  api<SessionResult>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
export const demoLogin = () =>
  api<SessionResult>('/auth/demo', { method: 'POST' });
export const loginWithGoogle = (idToken: string) =>
  api<SessionResult>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) });
export const refreshSession = (refreshToken: string) =>
  api<SessionResult>('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) });
export const logout = (refreshToken: string) =>
  api<{ message: string }>('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
export const requestPasswordReset = (email: string) =>
  api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) });
export const resetPassword = (body: { token: string; newPassword: string }) =>
  api<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify(body) });
export const changePassword = (body: { currentPassword: string; newPassword: string; currentRefreshToken?: string }) =>
  api<{ message: string }>('/auth/password/change', { method: 'POST', body: JSON.stringify(body) });
export const getMyProfile = () => api<ProfileResult>('/profile/me');
export const updateMyProfile = (body: { displayName: string; phone: string; visibility: 'public' | 'private' }) =>
  api<ProfileResult['playerProfile']>('/profile/me', { method: 'PATCH', body: JSON.stringify(body) });
export const authorizeAvatarUpload = (mimeType: 'image/jpeg' | 'image/png' | 'image/webp') =>
  api<AvatarUploadAuthorization>('/profile/me/avatar-upload', { method: 'POST', body: JSON.stringify({ mimeType }) });
export async function uploadAvatarFile(authorization: AvatarUploadAuthorization, file: File) {
  const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: file });
  if (!response.ok) throw new Error('Không thể tải ảnh đại diện lên.');
}
export const commitAvatarUpload = (objectKey: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') =>
  api<ProfileResult>('/profile/me/avatar', { method: 'PUT', body: JSON.stringify({ objectKey, mimeType }) });
export const getAdminAccounts = (filters: { query?: string; status?: string } = {}) => {
  const query = new URLSearchParams(Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return api<AdminAccountRow[]>(`/admin/users${query.size ? `?${query}` : ''}`);
};
export const lockAdminAccount = (id: string, reason: string) => api(`/admin/users/${id}/lock`, { method: 'POST', body: JSON.stringify({ reason }) });
export const unlockAdminAccount = (id: string, reason: string) => api(`/admin/users/${id}/unlock`, { method: 'POST', body: JSON.stringify({ reason }) });
