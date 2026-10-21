// Client kiểu OpenAI bằng fetch cho mọi nguồn miễn phí (Gemini, Groq, OpenRouter) + chuỗi dự phòng.
// Tên model/thứ tự chỉ đến từ env (tech design §2); không log nội dung prompt hay ảnh.

export type ProviderId = 'gemini' | 'groq' | 'openrouter';

export interface ChainLink { provider: ProviderId; model: string; baseUrl: string; apiKey: string }

export type ChatContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export interface ChatMessage { role: 'system' | 'user'; content: string | ChatContentPart[] }
export interface ChatRequest {
  messages: ChatMessage[];
  jsonSchema?: { name: string; schema: object };
  temperature?: number;
  /** Mức suy nghĩ cho model có suy nghĩ (Gemini, Groq gpt-oss); OpenRouter không gửi để tránh lỗi tham số lạ. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface CallLog {
  provider: ProviderId;
  model: string;
  chainIndex: number;
  ok: boolean;
  errorCode?: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
}

export interface RunChainOptions {
  timeoutMs: number;
  deadlineAt?: number;
  fetchImpl?: typeof fetch;
  onCall?: (log: CallLog) => void;
  now?: () => number;
}

const PROVIDERS: Record<ProviderId, { baseUrl: string; keyEnv: string }> = {
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY' },
};

/** `provider:model[,provider:model…]`; tách ở dấu `:` đầu tiên; thiếu key hoặc provider lạ thì bỏ mắt xích. */
export function parseChain(spec: string | undefined, env: Record<string, string | undefined>): ChainLink[] {
  const links: ChainLink[] = [];
  for (const entry of (spec ?? '').split(',')) {
    const item = entry.trim();
    const colon = item.indexOf(':');
    if (colon <= 0) continue;
    const provider = item.slice(0, colon) as ProviderId;
    const model = item.slice(colon + 1).trim();
    const config = PROVIDERS[provider];
    const apiKey = config && env[config.keyEnv];
    if (!config || !model || !apiKey) continue;
    links.push({ provider, model, baseUrl: config.baseUrl, apiKey });
  }
  return links;
}

const CIRCUIT_MS = 60_000;
const circuit = new Map<string, number>();

/** Chỉ cho test: xoá trạng thái circuit breaker cấp module. */
export function resetCircuitBreaker() {
  circuit.clear();
}

class CallError extends Error {
  constructor(readonly code: string) { super(code); }
}

async function postJson(link: ChainLink, path: string, body: object, timeoutMs: number, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${link.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${link.apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new CallError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK');
    }
    if (!response.ok) throw new CallError(`HTTP_${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new CallError(controller.signal.aborted ? 'TIMEOUT' : 'BAD_RESPONSE');
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Thử lần lượt từng mắt xích; chuyển nguồn khi lỗi HTTP, timeout, mạng hoặc sai khuôn (`parse` ném lỗi). */
export async function runChain<T>(
  links: ChainLink[], req: ChatRequest, parse: (raw: unknown) => T, opts: RunChainOptions,
): Promise<{ value: T; link: ChainLink } | { value: null; errors: CallLog[] }> {
  const now = opts.now ?? Date.now;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const errors: CallLog[] = [];
  for (const [chainIndex, link] of links.entries()) {
    const started = now();
    if (opts.deadlineAt !== undefined && started >= opts.deadlineAt) break;
    const key = `${link.provider}:${link.model}`;
    const fail = (errorCode: string) => {
      const log: CallLog = { provider: link.provider, model: link.model, chainIndex, ok: false, errorCode, latencyMs: now() - started };
      errors.push(log);
      opts.onCall?.(log);
    };
    if ((circuit.get(key) ?? 0) > started) {
      fail('CIRCUIT_OPEN');
      continue;
    }
    const timeoutMs = opts.deadlineAt === undefined ? opts.timeoutMs : Math.min(opts.timeoutMs, opts.deadlineAt - started);
    const body: Record<string, unknown> = { model: link.model, messages: req.messages, temperature: req.temperature ?? 0 };
    if (req.reasoningEffort && link.provider !== 'openrouter') body.reasoning_effort = req.reasoningEffort;
    if (req.jsonSchema) {
      body.response_format = { type: 'json_schema', json_schema: { ...req.jsonSchema, strict: true } };
    }
    let raw: { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    try {
      raw = await postJson(link, '/chat/completions', body, timeoutMs, fetchImpl) as typeof raw;
    } catch (error) {
      const code = error instanceof CallError ? error.code : 'NETWORK';
      if (code === 'HTTP_429') circuit.set(key, now() + CIRCUIT_MS);
      fail(code);
      continue;
    }
    let value: T;
    try {
      const content = raw.choices?.[0]?.message?.content;
      value = parse(typeof content === 'string' ? JSON.parse(content) : content);
    } catch {
      fail('SCHEMA_INVALID');
      continue;
    }
    opts.onCall?.({
      provider: link.provider, model: link.model, chainIndex, ok: true, latencyMs: now() - started,
      tokensIn: raw.usage?.prompt_tokens, tokensOut: raw.usage?.completion_tokens,
    });
    return { value, link };
  }
  return { value: null, errors };
}

/** `POST {baseUrl}/embeddings`; trả vector theo đúng thứ tự `texts`. Lỗi ném ra để caller giảm cấp. */
export async function embed(
  link: ChainLink, texts: string[], dims: number, opts: { timeoutMs: number; fetchImpl?: typeof fetch },
): Promise<number[][]> {
  const raw = await postJson(link, '/embeddings', { model: link.model, input: texts, dimensions: dims },
    opts.timeoutMs, opts.fetchImpl ?? fetch) as { data?: Array<{ index: number; embedding: number[] }> };
  const data = [...(raw.data ?? [])].sort((a, b) => a.index - b.index);
  if (data.length !== texts.length) throw new Error('embedding count mismatch');
  return data.map((item) => item.embedding);
}
