import type { SupportSource } from './supportAssistant.js';

export interface PolicyChunk extends SupportSource {
  text: string;
}

export interface PolicyRetriever {
  retrieve(question: string): readonly PolicyChunk[];
}

/**
 * Read-only policy seed transcribed from the approved BR-BOK-05 / D10 policy.
 * It is deterministic retrieval, not persistence or a vector store.
 */
const policyCorpus: readonly (PolicyChunk & { keywords: readonly string[] })[] = [{
  id: 'BR-BOK-05',
  title: 'BR-BOK-05 - chính sách hủy sân',
  text: 'Từ 24 giờ trước giờ bắt đầu hoàn 100%; từ 6 đến dưới 24 giờ hoàn 50%; dưới 6 giờ không hoàn.',
  keywords: ['hủy', 'huỷ', 'hoàn', 'refund', 'cancellation', 'booking', 'sân'],
}];

export const platformPolicyRetriever: PolicyRetriever = {
  retrieve(question: string): readonly PolicyChunk[] {
    const normalized = question.toLocaleLowerCase('vi');
    return policyCorpus
      .filter((chunk) => chunk.keywords.some((keyword) => normalized.includes(keyword)))
      .map(({ keywords: _keywords, ...chunk }) => chunk);
  },
};
