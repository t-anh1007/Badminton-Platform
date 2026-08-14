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

export const register = (body: { email: string; password: string; displayName: string }) =>
  api<{ message: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) });
export const verifyEmail = (body: { email: string; code: string }) =>
  api<{ message: string }>('/auth/verify', { method: 'POST', body: JSON.stringify(body) });
export const resendVerificationEmail = (email: string) =>
  api<{ message: string }>('/auth/verify/resend', { method: 'POST', body: JSON.stringify({ email }) });
export const login = (body: { email: string; password: string }) =>
  api<SessionResult>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
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
