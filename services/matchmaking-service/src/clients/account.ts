import { publicMatchProfileSchema, type PublicMatchProfile } from '@khoaluantn/shared';

export interface AccountClient {
  getPublicMatchProfile(userId: string): Promise<PublicMatchProfile | null>;
}

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
}
