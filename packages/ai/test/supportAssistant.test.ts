import { describe, expect, it } from 'vitest';
import { GeminiSupportAssistant, answerWithGroundedSources, platformPolicyRetriever } from '../src/index.js';

describe('shared Gemini support assistant', () => {
  it('accepts only a valid index into locally grounded answer candidates', async () => {
    const assistant = new GeminiSupportAssistant({
      apiKey: 'test-key',
      model: 'test-model',
      modelClient: { invoke: async () => ({ content: '{"answerIndex":0}' }) },
    });
    const result = await answerWithGroundedSources({
      question: 'Chính sách hủy sân thế nào?',
      candidates: [{ answer: 'Hoàn 100% từ 24 giờ.', sources: [{ id: 'BR-BOK-05', title: 'Chính sách hủy' }] }],
    }, assistant);
    expect(result).toEqual({
      answer: 'Hoàn 100% từ 24 giờ.',
      sources: [{ id: 'BR-BOK-05', title: 'Chính sách hủy' }],
      source: 'gemini',
    });
  });

  it('rejects an ungrounded Gemini answer index', async () => {
    await expect(answerWithGroundedSources({
      question: 'Q',
      candidates: [{ answer: 'A', sources: [{ id: 'source', title: 'Source' }] }],
    }, { selectAnswer: async () => 3 })).rejects.toThrow('invalid answer index');
  });

  it('retrieves the cited cancellation-policy chunk from the read-only seed corpus', () => {
    expect(platformPolicyRetriever.retrieve('Chính sách hủy sân thế nào?')).toEqual([
      expect.objectContaining({ id: 'BR-BOK-05', title: expect.stringContaining('hủy sân') }),
    ]);
  });
});
