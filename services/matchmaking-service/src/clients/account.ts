import { z } from 'zod';
import { publicMatchProfileSchema, type PublicMatchProfile } from '@khoaluantn/shared';

export interface PublicDisplayName { userId: string; displayName: string | null; avatarUrl: string | null }

export interface AccountClient {
  getPublicMatchProfile(userId: string): Promise<PublicMatchProfile | null>;
  /** Endpoint nội bộ có sẵn của Account; dùng để làm giàu một trang BXH/lịch sử, không sao chép hồ sơ. */
  getPublicDisplayNames(userIds: string[]): Promise<PublicDisplayName[]>;
  /** D58: tìm người chơi theo email để mời partner; null khi không có người chơi hợp lệ. */
  findPlayerIdByEmail?(email: string): Promise<string | null>;
}

const displayNamesResponse = z.object({
  profiles: z.array(z.object({ userId: z.string().uuid(), displayName: z.string().nullable(), avatarUrl: z.string().nullable() })),
});

export class HttpAccountClient implements AccountClient {
  constructor(private readonly baseUrl = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3001') {}

  async getPublicMatchProfile(userId: string) {
    const response = await fetch(
      `${this.baseUrl}/internal/players/${encodeURIComponent(userId)}/public-match-profile`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`account public match profile failed with ${response.status}`);
    return publicMatchProfileSchema.parse(await response.json());
  }

  async findPlayerIdByEmail(email: string) {
    const response = await fetch(`${this.baseUrl}/internal/players/by-email?email=${encodeURIComponent(email)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`account player lookup failed with ${response.status}`);
    return z.object({ userId: z.string().uuid() }).parse(await response.json()).userId;
  }

  async getPublicDisplayNames(userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return [];
    const response = await fetch(`${this.baseUrl}/internal/players/public-display-names`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userIds: unique }),
    });
    if (!response.ok) throw new Error(`account display-names lookup failed with ${response.status}`);
    return displayNamesResponse.parse(await response.json()).profiles;
  }
}
