import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { extractGeminiText, invokeGeminiWithDeadline, type GeminiTextModel } from './geminiMatchmaker.js';

export interface SupportSource {
  id: string;
  title: string;
}

export interface GroundedSupportCandidate {
  answer: string;
  sources: readonly SupportSource[];
}

export interface SupportAssistantInput {
  question: string;
  candidates: readonly GroundedSupportCandidate[];
}

export interface SupportAssistantClient {
  selectAnswer(input: SupportAssistantInput): Promise<number>;
}

export interface GroundedSupportAnswer extends GroundedSupportCandidate {
  source: 'gemini';
}

export interface GeminiSupportAssistantOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  modelClient?: GeminiTextModel;
}

/** Shared LangChain adapter: Gemini may choose only a locally grounded answer. */
export class GeminiSupportAssistant implements SupportAssistantClient {
  private readonly model: GeminiTextModel;
  private readonly timeoutMs: number;

  constructor(options: GeminiSupportAssistantOptions) {
    this.model = options.modelClient ?? new ChatGoogleGenerativeAI({
      apiKey: options.apiKey,
      model: options.model,
      temperature: 0,
      maxRetries: 0,
      json: true,
    });
    this.timeoutMs = options.timeoutMs ?? 4_000;
  }

  async selectAnswer(input: SupportAssistantInput): Promise<number> {
    const response = await invokeGeminiWithDeadline(this.model, buildPrompt(input), this.timeoutMs);
    const parsed = JSON.parse(extractGeminiText(response.content)) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || typeof (parsed as { answerIndex?: unknown }).answerIndex !== 'number') {
      throw new Error('Gemini support response has an invalid shape');
    }
    return (parsed as { answerIndex: number }).answerIndex;
  }
}

/** Returns only a local answer that has explicit, renderer-owned sources. */
export async function answerWithGroundedSources(
  input: SupportAssistantInput,
  client?: SupportAssistantClient,
): Promise<GroundedSupportAnswer> {
  if (!client) throw new Error('Gemini support assistant is unavailable');
  const answerIndex = await client.selectAnswer(input);
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= input.candidates.length) {
    throw new Error('Gemini returned an invalid answer index');
  }
  const candidate = input.candidates[answerIndex]!;
  if (!candidate.answer.trim() || candidate.sources.length === 0) {
    throw new Error('Grounded answer requires text and a source');
  }
  return { ...candidate, source: 'gemini' };
}

function buildPrompt(input: SupportAssistantInput): string {
  return [
    'Bạn là trợ lý hỗ trợ cầu lông. Chỉ chọn một câu trả lời có sẵn, không tự tạo dữ kiện hay hướng dẫn hành động.',
    'Trả về JSON {"answerIndex":0}. answerIndex phải là chỉ số hợp lệ trong answerChoices.',
    JSON.stringify({
      question: input.question,
      answerChoices: input.candidates.map((candidate) => ({
        answer: candidate.answer,
        sourceIds: candidate.sources.map((source) => source.id),
      })),
    }),
  ].join('\n');
}
