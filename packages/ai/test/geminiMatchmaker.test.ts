import { describe, expect, it } from 'vitest';
import {
  GeminiMatchmakerClient,
  enrichMatchmakerSuggestions,
  type MatchmakerCandidate,
} from '../src/index.js';

const candidate: MatchmakerCandidate = {
  matchId: '11111111-1111-4111-8111-111111111111',
  score: 88,
  fallbackExplanation: 'Điểm F-02 88: lệch rating 15, khớp khung giờ.',
  groundedReasons: ['Lệch rating 15 và khớp khung giờ.'],
  publicDetails: {
    skillMin: 'intermediate',
    skillMax: 'intermediate_plus',
    startAt: '2026-08-10T12:00:00.000Z',
    venueName: 'Nhà thi đấu công khai',
    courtName: 'Sân 1',
    feePerSlot: '100000',
  },
};

describe('AI-01 Gemini explanation adapter', () => {
  it('AC-AI-01-1/2/5: preserves F-02 score and sends only public match facts to Gemini', async () => {
    let prompt = '';
    const client = new GeminiMatchmakerClient({
      apiKey: 'test-key',
      model: 'test-model',
      modelClient: {
        invoke: async (input) => {
          prompt = input;
          return { content: JSON.stringify([{
            matchId: candidate.matchId,
            reasonIndexes: [0],
          }]) };
        },
      },
    });

    const result = await enrichMatchmakerSuggestions([candidate], client);

    expect(result).toEqual([expect.objectContaining({
      matchId: candidate.matchId,
      score: 88,
      source: 'gemini',
      explanation: expect.stringContaining('Lệch rating 15'),
    })]);
    expect(prompt).toContain('Nhà thi đấu công khai');
    expect(prompt).not.toContain('other-player-private-data');
    expect(prompt).not.toContain('organizerUserId');
  });

  it('AC-AI-01-2: rejects unverified reason indexes instead of displaying Gemini prose', async () => {
    const result = await enrichMatchmakerSuggestions([candidate], {
      explain: async () => [{ matchId: candidate.matchId, reasonIndexes: [1] }],
    });

    expect(result).toEqual([expect.objectContaining({
      source: 'fallback',
      explanation: expect.stringContaining('Giải thích rút gọn'),
    })]);
  });

  it('AC-AI-01-3: uses a short deterministic explanation when Gemini errors or times out', async () => {
    const unavailableClient = {
      explain: async () => { throw new Error('quota exceeded'); },
    };

    const [errorResult, timeoutResult] = await Promise.all([
      enrichMatchmakerSuggestions([candidate], unavailableClient),
      enrichMatchmakerSuggestions([candidate], new GeminiMatchmakerClient({
        apiKey: 'test-key',
        model: 'test-model',
        timeoutMs: 10,
        modelClient: { invoke: async () => new Promise(() => undefined) },
      })),
    ]);

    expect(errorResult).toEqual([expect.objectContaining({
      score: 88,
      source: 'fallback',
      explanation: expect.stringContaining('Giải thích rút gọn'),
    })]);
    expect(timeoutResult).toEqual([expect.objectContaining({ source: 'fallback' })]);
  });
});
