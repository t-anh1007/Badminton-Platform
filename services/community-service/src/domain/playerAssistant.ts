// Chatbot người chơi mở rộng (spec docs/plans/active/2026-11-21-player-chatbot.md).
// Không bao giờ thực hiện hành động; chỉ đọc dữ liệu của chính người hỏi bằng token của họ.
import {
  PLAYER_KNOWLEDGE,
  classifyPlayerQuestion,
  composePlayerAnswer,
  type ChainLink,
  type PlayerIntent,
  type PlayerQuestionCriteria,
} from '@khoaluantn/ai';
import type { PlayerDataClient, PlayerLocation } from '../clients/playerData.js';

export interface PlayerAssistantReply {
  kind: 'support' | 'match';
  intent: PlayerIntent | 'blocked';
  answer: string;
  sources: { id: string; title: string }[];
  source: 'ai' | 'fallback' | 'safety';
  actionPath?: string;
  suggestions?: unknown[];
}

/** Trung tâm TP.HCM khi người chơi không chia sẻ vị trí. */
const DEFAULT_LOCATION: PlayerLocation = { lat: 10.7769, lng: 106.7009 };

const ACTION_PATHS: Partial<Record<PlayerIntent, string>> = {
  my_bookings: '/profile?tab=bookings',
  my_matches: '/profile?tab=history',
  wallet: '/profile?tab=wallet',
  rating: '/passport',
  find_courts: '/venues',
};

// ---------------------------------------------------------------------------
// Chặn trước, không gọi AI
// ---------------------------------------------------------------------------

function asksAboutInternals(question: string): boolean {
  return /(source ?code|mã nguồn|\bcode\b|prompt|api ?key|database|cơ sở dữ liệu|\bschema\b|\bbackend\b|\bserver\b|hệ thống (xử lý|hoạt động) (thế nào|ra sao|như thế nào)|bên trong hệ thống|thuật toán)/iu.test(question);
}

function asksAboutOtherPerson(question: string): boolean {
  // "trình độ của Nam", "ví của user abc" — dữ liệu người khác. "của tôi/mình" thì hợp lệ.
  return /(trình độ|rating|điểm|ví|số dư|lịch|lượt đặt|booking|thông tin|hồ sơ|email|số điện thoại|sđt)\s+(của|cua)\s+(?!tôi|toi|mình|minh|em|tui|tớ|bạn\b)[\p{L}\p{N}@._-]+/iu.test(question);
}

// ---------------------------------------------------------------------------
// Rút gọn dữ liệu trước khi đưa cho AI
// ---------------------------------------------------------------------------

// Ẩn cả mã định danh (id, mã nội bộ) để AI không nhắc các chuỗi kỹ thuật với người chơi.
const HIDDEN_KEY = /(image|url|avatar|token|secret|bank|accountNumber|objectKey|password|userId|^id$|Id$|revision|snapshot)/i;

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** "2026-10-25T04:48:31Z" → "Thứ Bảy, 25/10/2026 lúc 11:48" (giờ Việt Nam) để AI không lặp lại dạng kỹ thuật. */
export function humanTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} lúc ${time}`;
}

export function compact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && ISO_DATETIME.test(value)) return humanTime(value);
    return typeof value === 'string' && value.length > 160 ? `${value.slice(0, 160)}…` : value;
  }
  if (depth > 4) return undefined;
  if (Array.isArray(value)) return value.slice(0, 6).map((item) => compact(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (HIDDEN_KEY.test(key)) continue;
    const next = compact(inner, depth + 1);
    if (next !== undefined) result[key] = next;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tiêu chí thời gian
// ---------------------------------------------------------------------------

function vietnamDate(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function hourIso(date: string, hour: number): string {
  if (hour >= 24) {
    const next = new Date(`${date}T00:00:00+07:00`);
    next.setUTCDate(next.getUTCDate() + 1);
    return new Date(next.getTime()).toISOString();
  }
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`).toISOString();
}

function timeWindow(criteria: PlayerQuestionCriteria, now: Date): { startFrom?: string; endBefore?: string } {
  if (!criteria.date && criteria.startHour === undefined && criteria.endHour === undefined) return {};
  const date = criteria.date ?? vietnamDate(now);
  const startHour = criteria.startHour ?? 0;
  const endHour = criteria.endHour ?? 24;
  if (endHour <= startHour) return {};
  const startFrom = hourIso(date, startHour);
  return { startFrom: startFrom < now.toISOString() ? now.toISOString() : startFrom, endBefore: hourIso(date, endHour) };
}

// ---------------------------------------------------------------------------
// Dự phòng không dùng AI
// ---------------------------------------------------------------------------

function keywordKnowledge(question: string) {
  const words = question.toLocaleLowerCase('vi').split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3);
  return PLAYER_KNOWLEDGE
    .map((section) => ({ section, hits: words.filter((word) => `${section.title} ${section.text}`.toLocaleLowerCase('vi').includes(word)).length }))
    .filter((item) => item.hits > 0)
    .sort((left, right) => right.hits - left.hits)[0]?.section;
}

function fallbackAnswer(intent: PlayerIntent, question: string): PlayerAssistantReply {
  const actionPath = ACTION_PATHS[intent];
  if (intent === 'policy' || intent === 'how_to') {
    const section = keywordKnowledge(question);
    if (section) {
      return { kind: 'support', intent, answer: `${section.title}: ${section.text}`, sources: [{ id: section.id, title: section.title }], source: 'fallback' };
    }
  }
  return {
    kind: 'support',
    intent,
    answer: actionPath
      ? 'Trợ lý AI đang tạm bận. Bạn bấm nút bên dưới để xem trực tiếp thông tin của mình nhé.'
      : 'Trợ lý AI đang tạm bận. Bạn thử lại sau giây lát hoặc gửi ticket hỗ trợ nhé.',
    sources: [],
    source: 'fallback',
    ...(actionPath ? { actionPath } : {}),
  };
}

// ---------------------------------------------------------------------------
// Điều phối
// ---------------------------------------------------------------------------

export async function answerPlayerQuestion(input: {
  question: string;
  authorization: string;
  location?: PlayerLocation;
  links: ChainLink[];
  data: PlayerDataClient;
  now?: Date;
}): Promise<PlayerAssistantReply> {
  const { question, authorization, location, links, data } = input;
  const now = input.now ?? new Date();

  if (asksAboutInternals(question)) {
    return {
      kind: 'support', intent: 'blocked', source: 'safety', sources: [],
      answer: 'Mình không chia sẻ mã nguồn hay cách hệ thống xử lý bên trong. Mình có thể giúp bạn về kèo, đặt sân, ví, trình độ và chính sách của CourtIn.',
    };
  }
  if (asksAboutOtherPerson(question)) {
    return {
      kind: 'support', intent: 'blocked', source: 'safety', sources: [],
      answer: 'Mình không cung cấp thông tin của người dùng khác. Khi bạn nhờ gợi ý kèo, mình sẽ tự chọn đối thủ hợp trình độ với bạn.',
    };
  }

  const { intent, criteria } = await classifyPlayerQuestion(question, links, now);

  if (intent === 'out_of_scope') {
    return {
      kind: 'support', intent, source: 'safety', sources: [],
      answer: 'Câu này nằm ngoài phạm vi của mình. Mình hỗ trợ: gợi ý kèo, tìm sân trống, lượt đặt sân, kèo, ví, trình độ của bạn và chính sách CourtIn.',
    };
  }

  if (intent === 'match') {
    const window = timeWindow(criteria, now);
    const response = await data.suggestMatches(authorization, {
      message: question,
      criteria: {
        ...(criteria.area ? { area: criteria.area } : {}),
        ...window,
        ...(criteria.feeMax ? { feeMax: String(criteria.feeMax) } : {}),
      },
      ...(location ? { location } : {}),
    }).catch(() => null);
    if (!response) return fallbackAnswer(intent, question);
    const body = response.body as { answer?: string; suggestions?: unknown[]; error?: { code?: string } };
    if (response.status === 409 && body.error?.code === 'PASSPORT_REQUIRED') {
      return {
        kind: 'support', intent, source: 'safety', sources: [], actionPath: '/passport',
        answer: 'Bạn cần khai trình độ (Passport) trước để mình gợi ý kèo hợp với bạn.',
      };
    }
    if (response.status !== 200) return fallbackAnswer(intent, question);
    return {
      kind: 'match', intent, source: 'ai', sources: [],
      // Chỉ nhắc bật vị trí khi có kèo để hiện khoảng cách; không có kèo thì lời nhắc vô ích.
      answer: `${body.answer ?? ''}${location || !body.suggestions?.length ? '' : ' (Bật quyền vị trí để mình tính khoảng cách tới sân.)'}`.trim(),
      suggestions: body.suggestions ?? [],
      actionPath: '/matches',
    };
  }

  let payload: unknown;
  try {
    switch (intent) {
      case 'my_bookings': payload = await data.myBookings(authorization); break;
      case 'my_matches': payload = await data.myMatches(authorization); break;
      case 'wallet': payload = await data.myWallets(authorization); break;
      case 'rating': payload = await data.myPassport(authorization); break;
      case 'find_courts': {
        const where = location ?? DEFAULT_LOCATION;
        const query: Record<string, string> = { lat: String(where.lat), lng: String(where.lng), radiusKm: '15', sortBy: 'distance' };
        if (criteria.date || criteria.startHour !== undefined) {
          query.date = criteria.date ?? vietnamDate(now);
          query.startMinute = String((criteria.startHour ?? 17) * 60);
          query.endMinute = String((criteria.endHour ?? (criteria.startHour ?? 17) + 2) * 60);
        }
        if (criteria.feeMax) query.maxPrice = String(criteria.feeMax);
        const rows = await data.searchCourts(query);
        payload = { searchedFrom: location ? 'vị trí của bạn' : 'trung tâm TP.HCM (chưa có vị trí của bạn)', venues: rows };
        break;
      }
      default: payload = undefined;
    }
  } catch {
    return fallbackAnswer(intent, question);
  }

  const composed = await composePlayerAnswer(question, intent, payload === undefined ? undefined : compact(payload), links, now);
  if (!composed) return fallbackAnswer(intent, question);
  const actionPath = ACTION_PATHS[intent];
  return { kind: 'support', intent, source: 'ai', answer: composed.answer, sources: composed.sources, ...(actionPath ? { actionPath } : {}) };
}
