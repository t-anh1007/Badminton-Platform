import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

export interface MatchmakerCandidate {
  matchId: string;
  score: number;
  fallbackExplanation: string;
  groundedReasons: readonly string[];
  publicDetails: {
    skillMin: string | null;
    skillMax: string | null;
    startAt: string;
    venueName: string;
    courtName: string;
    feePerSlot: string;
  };
}

/** Gemini may select only indexes into a candidate's verified reasons. */
export interface MatchmakerExplanation {
  matchId: string;
  reasonIndexes: readonly number[];
}

export interface MatchmakerExplanationClient {
  explain(candidates: readonly MatchmakerCandidate[]): Promise<readonly MatchmakerExplanation[]>;
}

export interface EnrichedMatchmakerSuggestion {
  matchId: string;
  score: number;
  explanation: string;
  source: 'gemini' | 'fallback';
}

export interface GeminiTextModel {
  invoke(prompt: string, config?: { signal?: AbortSignal }): Promise<{ content: unknown }>;
}

export interface GeminiMatchmakerClientOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  modelClient?: GeminiTextModel;
}

/**
 * Shared LangChain adapter. Gemini chooses verified evidence to foreground;
 * this library renders every displayed fact from deterministic F-02 output.
 */
export class GeminiMatchmakerClient implements MatchmakerExplanationClient {
  private readonly model: GeminiTextModel;
  private readonly timeoutMs: number;

  constructor(options: GeminiMatchmakerClientOptions) {
    this.model = options.modelClient ?? new ChatGoogleGenerativeAI({
      apiKey: options.apiKey,
      model: options.model,
      temperature: 0,
      maxRetries: 0,
      json: true,
    });
    this.timeoutMs = options.timeoutMs ?? 4_000;
  }

  async explain(candidates: readonly MatchmakerCandidate[]): Promise<readonly MatchmakerExplanation[]> {
    const response = await invokeGeminiWithDeadline(this.model, buildPrompt(candidates), this.timeoutMs);
    return parseGeminiExplanations(response.content);
  }
}

/**
 * Gemini cannot change F-02 scores or provide arbitrary factual prose. Its
 * valid response merely selects supplied, grounded reasons for local rendering.
 */
export async function enrichMatchmakerSuggestions(
  candidates: readonly MatchmakerCandidate[],
  client?: MatchmakerExplanationClient,
): Promise<EnrichedMatchmakerSuggestion[]> {
  if (!client) return fallbackSuggestions(candidates);
  try {
    const explanations = await client.explain(candidates);
    const explanationByMatchId = new Map(explanations.map((item) => [item.matchId, item]));
    return candidates.map((candidate) => {
      const explanation = explanationByMatchId.get(candidate.matchId);
      const reasons = explanation ? selectGroundedReasons(candidate, explanation.reasonIndexes) : undefined;
      if (!reasons) throw new Error('Gemini response omitted verified candidate reasons');
      return {
        matchId: candidate.matchId,
        score: candidate.score,
        explanation: `Điểm F-02 ${candidate.score}. ${reasons.join(' ')}`,
        source: 'gemini' as const,
      };
    });
  } catch {
    return fallbackSuggestions(candidates);
  }
}

function fallbackSuggestions(candidates: readonly MatchmakerCandidate[]): EnrichedMatchmakerSuggestion[] {
  return candidates.map((candidate) => ({
    matchId: candidate.matchId,
    score: candidate.score,
    explanation: `Giải thích rút gọn: ${candidate.fallbackExplanation}`,
    source: 'fallback',
  }));
}

function buildPrompt(candidates: readonly MatchmakerCandidate[]): string {
  const publicCandidates = candidates.map(({ matchId, score, groundedReasons, publicDetails }) => ({
    matchId,
    score,
    knownReasons: groundedReasons,
    ...publicDetails,
  }));
  return [
    'Bạn là trợ lý giải thích gợi ý kèo cầu lông.',
    'Trả về JSON array [{"matchId":"...","reasonIndexes":[0]}] đúng một phần tử cho mỗi matchId.',
    'reasonIndexes chỉ được chọn các chỉ số hợp lệ trong knownReasons. Không tự tạo điểm, câu chữ, dữ kiện hoặc dữ liệu người chơi khác.',
    JSON.stringify(publicCandidates),
  ].join('\n');
}

export async function invokeGeminiWithDeadline(
  model: GeminiTextModel,
  prompt: string,
  timeoutMs: number,
): Promise<{ content: unknown }> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Gemini matchmaker timed out'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([model.invoke(prompt, { signal: controller.signal }), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function selectGroundedReasons(
  candidate: MatchmakerCandidate,
  reasonIndexes: readonly number[],
): string[] | undefined {
  if (reasonIndexes.length === 0) return undefined;
  const uniqueIndexes = [...new Set(reasonIndexes)];
  if (uniqueIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= candidate.groundedReasons.length)) {
    return undefined;
  }
  const reasons = uniqueIndexes.map((index) => candidate.groundedReasons[index]).filter((reason): reason is string => Boolean(reason));
  return reasons.length > 0 ? reasons : undefined;
}

function parseGeminiExplanations(content: unknown): MatchmakerExplanation[] {
  const text = extractGeminiText(content);
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Gemini explanation is not an array');
  return parsed.map((item) => {
    const explanation = asRecord(item);
    if (typeof explanation.matchId !== 'string' || !Array.isArray(explanation.reasonIndexes)
      || explanation.reasonIndexes.some((index) => typeof index !== 'number')) {
      throw new Error('Gemini explanation has an invalid shape');
    }
    return { matchId: explanation.matchId, reasonIndexes: explanation.reasonIndexes as number[] };
  });
}

export function extractGeminiText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      const value = asRecord(part).text;
      return typeof value === 'string' ? value : '';
    }).join('');
  }
  throw new Error('Gemini content is not text');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
