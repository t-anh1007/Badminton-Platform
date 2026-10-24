import { describe, expect, it } from 'vitest';
import { embed, parseChain, resetCircuitBreaker, runChain, type CallLog, type ChainLink } from '../src/index.js';

const link = (provider: ChainLink['provider'], model: string): ChainLink => ({
  provider, model, baseUrl: `https://${provider}.test/v1`, apiKey: `key-${provider}`,
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function chatBody(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 11, completion_tokens: 7 } };
}

const parseOk = (raw: unknown) => {
  const value = raw as { ok?: unknown };
  if (value.ok !== true) throw new Error('bad shape');
  return value as { ok: true };
};

describe('parseChain', () => {
  it('drops links whose provider key is missing', () => {
    const links = parseChain('gemini:gemini-3.8-flash,groq:qwen/qwen3.8-27b', { GEMINI_API_KEY: 'k' });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'k',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    });
  });

  it('splits only at the first colon so OpenRouter :free models survive', () => {
    expect(parseChain('openrouter:nvidia/nemotron-3.5-super-vl:free', { OPENROUTER_API_KEY: 'k' })[0]?.model)
      .toBe('nvidia/nemotron-3.5-super-vl:free');
  });

  it('builds Cloudflare (needs account id) and Ollama links; Ollama models keep their own colon', () => {
    expect(parseChain('cloudflare:@cf/openai/gpt-oss-120b', { CLOUDFLARE_AI_API_TOKEN: 't' })).toEqual([]);
    expect(parseChain('cloudflare:@cf/openai/gpt-oss-120b', { CLOUDFLARE_AI_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'acc' })[0]).toMatchObject({
      model: '@cf/openai/gpt-oss-120b', baseUrl: 'https://api.cloudflare.com/client/v4/accounts/acc/ai/v1',
    });
    expect(parseChain('ollama:gpt-oss:120b', { OLLAMA_API_KEY: 'o' })[0]).toMatchObject({ model: 'gpt-oss:120b', baseUrl: 'https://ollama.com/v1' });
  });

  it('ignores unknown providers and blank specs', () => {
    expect(parseChain('nvidia:x, ,', { GEMINI_API_KEY: 'k' })).toEqual([]);
    expect(parseChain(undefined, {})).toEqual([]);
  });
});

describe('runChain', () => {
  it('falls back on 429 and logs both calls', async () => {
    resetCircuitBreaker();
    const logs: CallLog[] = [];
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return requests.length === 1 ? jsonResponse(429, {}) : jsonResponse(200, chatBody({ ok: true }));
    }) as unknown as typeof fetch;
    const result = await runChain([link('gemini', 'a'), link('groq', 'b')], {
      messages: [{ role: 'user', content: 'hi' }],
      jsonSchema: { name: 'thing', schema: { type: 'object' } },
    }, parseOk, { timeoutMs: 1000, fetchImpl, onCall: (log) => logs.push(log) });
    expect(result.value).toEqual({ ok: true });
    expect('link' in result && result.link.provider).toBe('groq');
    expect(logs.map((log) => [log.ok, log.errorCode, log.chainIndex])).toEqual([[false, 'HTTP_429', 0], [true, undefined, 1]]);
    expect(logs[1]).toMatchObject({ tokensIn: 11, tokensOut: 7 });
    expect(requests[1]?.url).toBe('https://groq.test/v1/chat/completions');
    expect((requests[1]?.init.headers as Record<string, string>).Authorization).toBe('Bearer key-groq');
    expect(JSON.parse(String(requests[1]?.init.body)).response_format).toEqual({
      type: 'json_schema', json_schema: { name: 'thing', schema: { type: 'object' }, strict: true },
    });
  });

  it('treats a parse failure as SCHEMA_INVALID and moves on', async () => {
    resetCircuitBreaker();
    const logs: CallLog[] = [];
    let call = 0;
    const fetchImpl = (async () => jsonResponse(200, chatBody(call++ === 0 ? { ok: 'no' } : { ok: true }))) as unknown as typeof fetch;
    const result = await runChain([link('gemini', 'a'), link('groq', 'b')], { messages: [] }, parseOk,
      { timeoutMs: 1000, fetchImpl, onCall: (log) => logs.push(log) });
    expect(result.value).toEqual({ ok: true });
    expect(logs[0]?.errorCode).toBe('SCHEMA_INVALID');
  });

  it('unwraps ```json fences and surrounding prose before schema validation', async () => {
    resetCircuitBreaker();
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Kết quả:\n```json\n{"ok": true}\n```' } }],
    }))) as unknown as typeof fetch;
    const result = await runChain([link('gemini', 'a')], { messages: [] }, parseOk, { timeoutMs: 1000, fetchImpl });
    expect(result.value).toEqual({ ok: true });
  });

  it('times out slow links', async () => {
    resetCircuitBreaker();
    const fetchImpl = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    const result = await runChain([link('gemini', 'a')], { messages: [] }, parseOk, { timeoutMs: 20, fetchImpl });
    expect(result.value).toBeNull();
    expect('errors' in result && result.errors[0]?.errorCode).toBe('TIMEOUT');
  });

  it('opens the circuit for 60 seconds after a 429', async () => {
    resetCircuitBreaker();
    let calls = 0;
    let clock = 1_000_000;
    const fetchImpl = (async () => { calls += 1; return jsonResponse(429, {}); }) as unknown as typeof fetch;
    const opts = { timeoutMs: 1000, fetchImpl, now: () => clock };
    await runChain([link('gemini', 'a')], { messages: [] }, parseOk, opts);
    clock += 59_000;
    const second = await runChain([link('gemini', 'a')], { messages: [] }, parseOk, opts);
    expect(calls).toBe(1);
    expect('errors' in second && second.errors[0]?.errorCode).toBe('CIRCUIT_OPEN');
    clock += 2_000;
    await runChain([link('gemini', 'a')], { messages: [] }, parseOk, opts);
    expect(calls).toBe(2);
  });

  it('stops calling once the deadline has passed', async () => {
    resetCircuitBreaker();
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return jsonResponse(500, {}); }) as unknown as typeof fetch;
    const result = await runChain([link('gemini', 'a'), link('groq', 'b')], { messages: [] }, parseOk,
      { timeoutMs: 1000, fetchImpl, now: () => 5000, deadlineAt: 4000 });
    expect(result.value).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('embed', () => {
  it('posts to /embeddings and returns vectors in input order', async () => {
    let body: { input?: string[]; dimensions?: number; model?: string } = {};
    const fetchImpl = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://gemini.test/v1/embeddings');
      body = JSON.parse(String(init.body));
      return jsonResponse(200, { data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] });
    }) as unknown as typeof fetch;
    const vectors = await embed(link('gemini', 'emb'), ['a', 'b'], 2, { timeoutMs: 1000, fetchImpl });
    expect(vectors).toEqual([[1, 0], [0, 1]]);
    expect(body).toMatchObject({ model: 'emb', input: ['a', 'b'], dimensions: 2 });
  });
});
