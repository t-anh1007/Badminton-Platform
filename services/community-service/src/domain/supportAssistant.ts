import {
  answerWithGroundedSources,
  platformPolicyRetriever,
  type PolicyRetriever,
  type SupportAssistantClient,
  type SupportSource,
} from '@khoaluantn/ai';
import type { BookingClient, OwnBookingSummary } from '../clients/venueBooking.js';

const cancellationFlow: SupportSource = { id: 'BOK-07', title: 'BOK-07 - luồng hủy booking chuẩn' };
const privacyRule: SupportSource = { id: 'AI-02-privacy', title: 'AI-02 - chỉ dữ liệu của chính bạn' };

export interface SupportReply {
  answer: string;
  sources: readonly SupportSource[];
  source: 'gemini' | 'fallback' | 'safety';
  actionPath?: string;
}

/**
 * Retrieves only evidence allowed by AI-02, then lets the shared adapter pick
 * a locally-rendered answer. This function never executes a booking action.
 */
export async function answerSupportQuestion(
  question: string,
  authorization: string,
  bookingClient: BookingClient,
  assistant?: SupportAssistantClient,
  policyRetriever: PolicyRetriever = platformPolicyRetriever,
): Promise<SupportReply> {
  if (asksForOtherUserData(question)) {
    return {
      answer: 'Tôi không thể truy xuất dữ liệu của người dùng khác. Tôi chỉ có thể hỗ trợ dữ liệu của chính bạn.',
      sources: [privacyRule],
      source: 'safety',
    };
  }
  if (asksForCancellationAction(question)) {
    return {
      answer: 'Tôi không thể tự hủy booking. Bạn hãy mở booking của mình và dùng luồng hủy chuẩn để xác nhận.',
      sources: [cancellationFlow],
      source: 'safety',
      actionPath: '/players/me/bookings',
    };
  }

  if (asksForOwnBooking(question)) {
    let bookings;
    try {
      bookings = await bookingClient.getMyBookings(authorization);
    } catch {
      return {
        answer: 'Không thể tải dữ liệu booking của bạn lúc này. Bạn hãy mở danh sách booking để xem trực tiếp.',
        sources: [],
        source: 'fallback',
        actionPath: '/players/me/bookings',
      };
    }
    try {
      const nearest = nearestBooking(bookings.upcoming, bookings.past);
      const candidate = nearest
        ? {
          answer: `Booking gần nhất của bạn là ${nearest.courtName} tại ${nearest.venueName}, bắt đầu ${nearest.startAt}.`,
          sources: [{ id: 'own-booking', title: 'Dữ liệu booking của bạn' }],
        }
        : {
          answer: 'Hiện tôi không tìm thấy booking marketplace nào của bạn.',
          sources: [{ id: 'own-booking', title: 'Dữ liệu booking của bạn' }],
        };
      return await answerWithGroundedSources({ question, candidates: [candidate] }, assistant);
    } catch {
      return { answer: 'Trợ lý tạm bận, bạn vui lòng thử lại sau.', sources: [], source: 'fallback' };
    }
  }

  let policy;
  try {
    policy = policyRetriever.retrieve(question)[0];
  } catch {
    return { answer: 'Không thể truy xuất tài liệu chính sách lúc này.', sources: [], source: 'fallback' };
  }
  if (!policy) {
    return {
      answer: 'Tôi hiện hỗ trợ chính sách hủy sân và dữ liệu booking của chính bạn.',
      sources: [],
      source: 'safety',
    };
  }
  try {
    return await answerWithGroundedSources({
      question,
      candidates: [{ answer: `Theo ${policy.title}: ${policy.text}`, sources: [policy] }],
    }, assistant);
  } catch {
    return { answer: 'Trợ lý tạm bận, bạn vui lòng thử lại sau.', sources: [], source: 'fallback' };
  }
}

function asksForOtherUserData(question: string): boolean {
  return /\b(?:user|người dùng|người chơi)\s+(?!tôi\b)[\p{L}\p{N}_-]+/iu.test(question);
}

function asksForCancellationAction(question: string): boolean {
  const asksPolicy = /(chính sách|policy|tỷ lệ hoàn|hoàn bao nhiêu)/iu.test(question);
  return !asksPolicy && /(hủy|huỷ|cancel)/iu.test(question);
}

function asksForOwnBooking(question: string): boolean {
  return /(booking|đặt sân).*(gần nhất|khi nào|của tôi)|(gần nhất|khi nào).*(booking|đặt sân)/iu.test(question);
}

function nearestBooking(upcoming: readonly OwnBookingSummary[], past: readonly OwnBookingSummary[]): OwnBookingSummary | undefined {
  const next = [...upcoming].sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
  if (next) return next;
  return [...past].sort((left, right) => right.startAt.localeCompare(left.startAt))[0];
}
