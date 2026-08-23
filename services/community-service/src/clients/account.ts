import { z } from 'zod';

export interface PublicIdentityEntry { userId: string; displayName: string | null; avatarUrl: string | null }

export interface AccountEligibilityClient {
  isVerifiedPlayer(userId: string): Promise<boolean>;
  getPublicDisplayNames(userIds: string[]): Promise<PublicIdentityEntry[]>;
}

const publicMatchProfile = z.object({ userId: z.string().uuid() }).passthrough();
const displayNamesResponse = z.object({
  profiles: z.array(z.object({ userId: z.string().uuid(), displayName: z.string().nullable(), avatarUrl: z.string().nullable() })),
});

/** Uses Account's existing internal eligibility projection; no cross-schema read. */
export class HttpAccountEligibilityClient implements AccountEligibilityClient {
  constructor(private readonly baseUrl = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3001') {}

  async isVerifiedPlayer(userId: string): Promise<boolean> {
    const response = await fetch(
      `${this.baseUrl}/internal/players/${encodeURIComponent(userId)}/public-match-profile`,
    );
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`account eligibility failed with ${response.status}`);
    return publicMatchProfile.parse(await response.json()).userId === userId;
  }

  async getPublicDisplayNames(userIds: string[]): Promise<PublicIdentityEntry[]> {
    const unique = Array.from(new Set(userIds));
    if (unique.length === 0) return [];
    const response = await fetch(`${this.baseUrl}/internal/players/public-display-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: unique }),
    });
    if (!response.ok) throw new Error(`account display-names lookup failed with ${response.status}`);
    return displayNamesResponse.parse(await response.json()).profiles;
  }
}
