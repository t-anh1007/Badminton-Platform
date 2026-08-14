const BASE_URL = import.meta.env.VITE_COMMUNITY_URL ?? '/api/community';

export type ContentStatus = 'published' | 'hidden' | 'removed';
export type ReportTarget = 'post' | 'comment';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface CommunityPost {
  id: string;
  authorUserId: string;
  body: string;
  status: ContentStatus;
  createdAt: string;
  editedAt: string | null;
  commentCount?: number;
  images?: CommunityPostImage[];
}

export interface CommunityPostImage {
  id?: string;
  objectKey: string;
  width: number;
  height: number;
  alt: string;
  position: number;
}

export interface UploadAuthorization {
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorUserId: string;
  body: string;
  status: ContentStatus;
  createdAt: string;
}

export interface CommunityPostDetail extends CommunityPost {
  comments: CommunityComment[];
}

export interface CommunityReport {
  id: string;
  reporterUserId: string;
  targetType: ReportTarget;
  targetId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  requesterUserId: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderUserId: string;
  senderRole: 'player' | 'admin';
  body: string;
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: TicketMessage[];
}

export class CommunityApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'CommunityApiError';
    this.status = status;
    this.code = code;
  }
}

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
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const fallback =
      response.status === 403 ? 'Bạn không có quyền thực hiện thao tác này.' : 'Không thể xử lý yêu cầu cộng đồng.';
    throw new CommunityApiError(body.error?.message ?? fallback, response.status, body.error?.code);
  }
  return body;
}

export function getCommunitySession(): {
  userId: string;
  roles: string[];
} | null {
  const token = accessToken();
  if (!token) return null;
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const normalizedPart = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const normalized = normalizedPart.padEnd(Math.ceil(normalizedPart.length / 4) * 4, '=');
    const payload = JSON.parse(atob(normalized)) as {
      sub?: string;
      roles?: unknown;
    };
    return payload.sub
      ? {
          userId: payload.sub,
          roles: Array.isArray(payload.roles)
            ? payload.roles.filter((role): role is string => typeof role === 'string')
            : [],
        }
      : null;
  } catch {
    return null;
  }
}

export function listCommunityPosts(page = 1, pageSize = 10) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return api<{ posts: CommunityPost[] }>(`/posts?${query}`);
}

export const listOwnPosts = () => api<{ posts: CommunityPost[] }>('/posts/mine');
export const getCommunityPost = (postId: string) => api<CommunityPostDetail>(`/posts/${postId}`);
export const authorizeCommunityPostImage = (mimeType: 'image/jpeg' | 'image/png' | 'image/webp') =>
  api<UploadAuthorization>('/uploads/posts', { method: 'POST', body: JSON.stringify({ mimeType }) });

export async function uploadAuthorizedFile(authorization: UploadAuthorization, file: File, onProgress?: (progress: number) => void): Promise<void> {
  onProgress?.(0);
  const response = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers, body: file });
  if (!response.ok) throw new Error('Không thể tải ảnh lên kho lưu trữ.');
  onProgress?.(100);
}

export const createCommunityPost = (body: string, images: CommunityPostImage[] = []) =>
  api<CommunityPost>('/posts', {
    method: 'POST',
    body: JSON.stringify({ body, images }),
  });
export const editCommunityPost = (postId: string, body: string, images?: CommunityPostImage[]) =>
  api<CommunityPost>(`/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body, ...(images ? { images } : {}) }),
  });
export const removeCommunityPost = (postId: string) => api<CommunityPost>(`/posts/${postId}`, { method: 'DELETE' });

export const createCommunityComment = (postId: string, body: string) =>
  api<CommunityComment>(`/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
export const removeCommunityComment = (commentId: string) =>
  api<CommunityComment>(`/comments/${commentId}`, { method: 'DELETE' });

export const createCommunityReport = (targetType: ReportTarget, targetId: string, reason: string) =>
  api<CommunityReport>('/reports', {
    method: 'POST',
    body: JSON.stringify({ targetType, targetId, reason }),
  });
export const listOwnReports = () => api<{ reports: CommunityReport[] }>('/reports/mine');

export const listSupportTickets = () => api<{ tickets: SupportTicket[] }>('/tickets');
export const getSupportTicket = (ticketId: string) => api<SupportTicketDetail>(`/tickets/${ticketId}`);
export const createSupportTicket = (subject: string, body: string) =>
  api<SupportTicket>('/tickets', {
    method: 'POST',
    body: JSON.stringify({ subject, body }),
  });
export const addSupportTicketMessage = (ticketId: string, body: string) =>
  api<TicketMessage>(`/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
export const setSupportTicketStatus = (ticketId: string, status: 'resolved' | 'closed') =>
  api<SupportTicket>(`/tickets/${ticketId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
