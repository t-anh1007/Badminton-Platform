import { z } from 'zod';

export interface DisplayNameEntry {
  userId: string;
  displayName: string | null;
}

export interface AccountDisplayNameClient {
  getPublicDisplayNames(userIds: string[]): Promise<DisplayNameEntry[]>;
}

const displayNamesResponse = z.object({
  profiles: z.array(z.object({
    userId: z.string().uuid(),
    displayName: z.string().nullable(),
  })),
});

export class HttpAccountDisplayNameClient implements AccountDisplayNameClient {
  constructor(private readonly baseUrl = process.env.ACCOUNT_SERVICE_URL ?? 'http://localhost:3001') {}

  async getPublicDisplayNames(userIds: string[]): Promise<DisplayNameEntry[]> {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (uniqueUserIds.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/internal/players/public-display-names`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: uniqueUserIds }),
    });
    if (!response.ok) throw new Error(`account display-names lookup failed with ${response.status}`);
    return displayNamesResponse.parse(await response.json()).profiles;
  }
}
