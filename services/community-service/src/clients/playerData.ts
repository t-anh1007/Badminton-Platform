// Dữ liệu của CHÍNH người hỏi cho chatbot: gọi endpoint người chơi sẵn có bằng token của họ (không có quyền mới).
// Chỉ đọc. Lỗi ném ra để domain trả câu trả lời dự phòng.

export interface PlayerLocation {
  lat: number;
  lng: number;
}

export interface MatchSuggestionRequest {
  message: string;
  criteria: { area?: string; startFrom?: string; endBefore?: string; feeMax?: string };
  location?: PlayerLocation;
}

export interface PlayerDataClient {
  myBookings(authorization: string): Promise<unknown>;
  myMatches(authorization: string): Promise<unknown>;
  myWallets(authorization: string): Promise<unknown>;
  myPassport(authorization: string): Promise<unknown>;
  searchCourts(query: Record<string, string>): Promise<unknown>;
  suggestMatches(authorization: string, body: MatchSuggestionRequest): Promise<{ status: number; body: unknown }>;
}

const VENUE = () => process.env.VENUE_BOOKING_SERVICE_URL ?? 'http://localhost:3002';
const FINANCE = () => process.env.FINANCE_SERVICE_URL ?? 'http://localhost:3003';
const MATCHMAKING = () => process.env.MATCHMAKING_SERVICE_URL ?? 'http://localhost:3004';

async function getJson(url: string, authorization?: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: authorization ? { authorization } : {},
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`player data lookup failed with ${response.status}`);
  return response.json();
}

export class HttpPlayerDataClient implements PlayerDataClient {
  myBookings(authorization: string) { return getJson(`${VENUE()}/players/me/bookings`, authorization); }
  myMatches(authorization: string) { return getJson(`${MATCHMAKING()}/matches/me/history`, authorization); }
  myWallets(authorization: string) { return getJson(`${FINANCE()}/wallets/me`, authorization); }
  myPassport(authorization: string) { return getJson(`${MATCHMAKING()}/passports/me`, authorization); }
  searchCourts(query: Record<string, string>) { return getJson(`${VENUE()}/search?${new URLSearchParams(query)}`); }

  async suggestMatches(authorization: string, body: MatchSuggestionRequest) {
    const response = await fetch(`${MATCHMAKING()}/matches/suggestions/ai/chat`, {
      method: 'POST',
      headers: { authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }
}
