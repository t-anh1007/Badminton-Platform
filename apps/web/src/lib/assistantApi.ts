const MATCHMAKING_URL = import.meta.env.VITE_MATCHMAKING_URL ?? '/api/matchmaking';
const COMMUNITY_URL = import.meta.env.VITE_COMMUNITY_URL ?? '/api/community';

export interface AssistantSession {
  userId: string;
  roles: string[];
}

export interface AiMatchSuggestion {
  matchId: string;
  score: number;
  explanation: string;
  source: 'gemini' | 'fallback';
  joinPath: string;
  match: {
    id: string;
    openSlots: number;
    feePerSlot: string;
    skillMin: string | null;
    skillMax: string | null;
    startAt: string;
    endAt: string;
    court: { id: string; name: string };
    venue: { id: string; name: string; address: string };
  };
}

export interface AssistantSource {
  id: string;
  title: string;
}

export interface SupportAssistantReply {
  answer: string;
  sources: AssistantSource[];
  source: 'gemini' | 'fallback' | 'safety';
  actionPath?: string;
}

export interface MatchAssistantReply {
  answer: string;
  normalizedCriteria: {
    area?: string;
    startFrom?: string;
    endBefore?: string;
    feeMax?: string;
  };
  suggestions: AiMatchSuggestion[];
  actionPath?: string;
}

export class AssistantApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
    this.code = code;
  }
}

function accessToken(): string | null {
  return typeof window === 'undefined' ? null : window.localStorage.getItem('accessToken');
}

export function getAssistantSession(): AssistantSession | null {
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

async function api<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const token = accessToken();
  const response = await fetch(`${baseUrl}${path}`, {
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
    throw new AssistantApiError(
      body.error?.message ?? 'Không thể kết nối trợ lý lúc này.',
      response.status,
      body.error?.code,
    );
  }
  return body;
}

export function listAiMatchSuggestions() {
  return api<{ suggestions: AiMatchSuggestion[] }>(MATCHMAKING_URL, '/matches/suggestions/ai');
}
export function chatAiMatchSuggestions(message: string, criteria?: Record<string, unknown>) {
  return api<MatchAssistantReply>(MATCHMAKING_URL, '/matches/suggestions/ai/chat', { method: 'POST', body: JSON.stringify({ message, criteria }) });
}

export function askSupportAssistant(question: string) {
  return api<SupportAssistantReply>(COMMUNITY_URL, '/assistant/chat', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}
