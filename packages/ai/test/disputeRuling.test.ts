import { describe, expect, it } from 'vitest';
import { proposeRuling, resetCircuitBreaker, type ChainLink, type RulingInput } from '../src/index.js';

const links: ChainLink[] = [
  { provider: 'gemini', model: 'a', baseUrl: 'https://g.test', apiKey: 'k' },
  { provider: 'groq', model: 'b', baseUrl: 'https://q.test', apiKey: 'k' },
];

const input: RulingInput = {
  caseRef: 'case-1',
  format: 'bo3',
  evidence: [
    {
      evidenceId: 'e1', team: 'A', supports: 'TEAM_A_WIN', level: 'green', capturedAt: '2026-10-21T12:00:00.000Z',
      nearDuplicate: false, screenshot: false, sets: [{ a: 21, b: 18 }, { a: 21, b: 15 }], submittedAt: '2026-10-21T12:10:00.000Z',
    },
    {
      evidenceId: 'e2', team: 'B', supports: 'TEAM_B_WIN', level: 'yellow', capturedAt: null,
      nearDuplicate: true, screenshot: true, sets: [{ a: 18, b: 21 }, { a: 15, b: 21 }], submittedAt: '2026-10-21T12:20:00.000Z',
    },
  ],
  chunks: [{ id: 'BR-RA-16', text: 'Ảnh gần trùng là Vàng.' }, { id: 'BR-RA-34', text: 'Hai bên có bằng chứng thì tầng 2.' }],
};

const good = {
  outcome: 'TEAM_A_WIN',
  confidence: 0.9,
  reasons: [{ text: 'Ảnh của đội B gần trùng hồ sơ khác.', citations: ['BR-RA-16'] }],
  adminNotes: 'Ảnh B nghi trùng, không có giờ chụp.',
};

function reply(content: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
}

async function run(first: unknown, second: unknown = good) {
  resetCircuitBreaker();
  const bodies: string[] = [];
  let call = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return reply(call++ === 0 ? first : second);
  }) as unknown as typeof fetch;
  const result = await proposeRuling(links, input, { timeoutMs: 1000, fetchImpl });
  return { result, bodies };
}

describe('proposeRuling', () => {
  it('passes a valid ruling through unchanged', async () => {
    const { result } = await run(good);
    expect(result?.link.provider).toBe('gemini');
    expect(result?.ruling).toEqual(good);
  });

  it('rejects a citation outside the retrieved chunks', async () => {
    const { result } = await run({ ...good, reasons: [{ text: 'x', citations: ['BR-XX-99'] }] });
    expect(result?.link.provider).toBe('groq');
  });

  it('rejects an outcome outside the three allowed values', async () => {
    const { result } = await run({ ...good, outcome: 'TEAM_C_WIN' });
    expect(result?.link.provider).toBe('groq');
  });

  it('rejects empty reasons and reasons without any citation', async () => {
    expect((await run({ ...good, reasons: [] })).result?.link.provider).toBe('groq');
    expect((await run({ ...good, reasons: [{ text: 'x', citations: [] }] })).result?.link.provider).toBe('groq');
  });

  it('sends text only, without images or reputation', async () => {
    const { bodies } = await run(good);
    expect(bodies[0]).not.toContain('data:image');
    expect(bodies[0]?.toLowerCase()).not.toMatch(/reputation|uy tín/);
    expect(bodies[0]).toContain('BR-RA-34');
  });
});
