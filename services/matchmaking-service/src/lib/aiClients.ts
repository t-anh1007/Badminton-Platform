import { parseChain, type CallLog, type ChainLink } from '@khoaluantn/ai';
import { prisma } from './prisma.js';

// Dựng chuỗi AI từ env (tech design §8) và ghi AiCallLog. Thiếu key → bỏ mắt xích; RESULT_AI_ENABLED=false → chuỗi rỗng.

export interface AiChains {
  ocr: ChainLink[];
  ruling: ChainLink[];
  embedding: ChainLink | null;
  embeddingDims: number;
  fetchImpl?: typeof fetch;
}

type Env = Record<string, string | undefined>;

export function aiChainsFromEnv(env: Env = process.env): AiChains {
  if (env.RESULT_AI_ENABLED === 'false') return { ocr: [], ruling: [], embedding: null, embeddingDims: 768 };
  // `gemini:gemini-embedding-2:768` — đuôi số là số chiều.
  const embeddingSpec = /^(.*):(\d+)$/.exec(env.AI_EMBEDDING ?? '');
  return {
    ocr: parseChain(env.AI_OCR_CHAIN, env),
    ruling: parseChain(env.AI_RULING_CHAIN, env),
    embedding: parseChain(embeddingSpec?.[1] ?? env.AI_EMBEDDING, env)[0] ?? null,
    embeddingDims: embeddingSpec ? Number(embeddingSpec[2]) : 768,
  };
}

function numberEnv(env: Env, name: string, fallback: number) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function aiSettings(env: Env = process.env) {
  return {
    callTimeoutMs: numberEnv(env, 'AI_CALL_TIMEOUT_MS', 12_000),
    ocrBudgetMs: numberEnv(env, 'AI_OCR_BUDGET_MS', 30_000),
    cellConfidence: numberEnv(env, 'OCR_CELL_CONFIDENCE', 0.9),
    rulingThreshold: numberEnv(env, 'RULING_CONFIDENCE_THRESHOLD', 0.85),
    /** Tầng 2 chạy nền nên chờ lâu hơn đọc ảnh đồng bộ; gemini-3.8-flash đo được 15–67 giây (22/10/2026). */
    rulingTimeoutMs: numberEnv(env, 'AI_RULING_TIMEOUT_MS', 90_000),
  };
}

export type AiPurpose = 'ocr' | 'ruling' | 'embed' | 'judge';

/** Gom log các lần gọi rồi ghi một lượt; không chứa prompt. */
export function aiCallLogger(purpose: AiPurpose, caseId: string | null) {
  const logs: CallLog[] = [];
  return {
    onCall: (log: CallLog) => { logs.push(log); },
    flush: async () => {
      if (logs.length === 0) return;
      await prisma.aiCallLog.createMany({
        data: logs.splice(0).map((log) => ({
          purpose, caseId, provider: log.provider, model: log.model, chainIndex: log.chainIndex, ok: log.ok,
          errorCode: log.errorCode ?? null, latencyMs: Math.round(log.latencyMs), tokensIn: log.tokensIn ?? null, tokensOut: log.tokensOut ?? null,
        })),
      });
    },
  };
}
