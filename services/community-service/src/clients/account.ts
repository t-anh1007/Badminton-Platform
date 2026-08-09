import { z } from 'zod';

export interface AccountEligibilityClient {
  isVerifiedPlayer(userId: string): Promise<boolean>;
}

const publicMatchProfile = z.object({ userId: z.string().uuid() }).passthrough();

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
}
