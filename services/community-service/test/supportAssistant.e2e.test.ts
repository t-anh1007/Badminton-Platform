import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';

process.env.JWT_SECRET ??= 'community-test-jwt-secret';

interface SeenInput {
  question: string;
  candidates: readonly { answer: string; sources: readonly { id: string }[] }[];
}

class FakeSupportAssistant {
  seen: SeenInput[] = [];

  async selectAnswer(input: SeenInput): Promise<number> {
    this.seen.push(input);
    return 0;
  }
}

class FakeBookingClient {
  calls: string[] = [];

  async getMyBookings(authorization: string) {
    this.calls.push(authorization);
    return {
      upcoming: [
        { id: randomUUID(), startAt: '2026-08-20T12:00:00.000Z', venueName: 'Sân Gần', courtName: 'Sân 2' },
        { id: randomUUID(), startAt: '2026-08-22T12:00:00.000Z', venueName: 'Sân Xa', courtName: 'Sân 3' },
      ],
      past: [],
    };
  }
}

class FakePolicyRetriever {
  calls: string[] = [];

  retrieve(question: string) {
    this.calls.push(question);
    return [{
      id: 'BR-BOK-05',
      title: 'BR-BOK-05 - chính sách hủy sân',
      text: 'Nội dung chính sách được truy hồi từ corpus kiểm thử.',
    }];
  }
}

function playerAuthorization(userId = randomUUID()): string {
  const accessToken = jwt.sign(
    { sub: userId, roles: ['player'], type: 'access' },
    process.env.JWT_SECRET ?? 'change-me-in-real-env',
    { expiresIn: 300 },
  );
  return `Bearer ${accessToken}`;
}

describe('AI-02 — grounded support assistant', () => {
  it('answers cancellation policy from the cited BR-BOK-05 source', async () => {
    const assistant = new FakeSupportAssistant();
    const bookings = new FakeBookingClient();
    const policyRetriever = new FakePolicyRetriever();
    const app = createApp({ supportAssistant: assistant, bookingClient: bookings, policyRetriever });

    const response = await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Chính sách hủy sân thế nào?' }).expect(200);

    expect(response.body.answer).toContain('Nội dung chính sách được truy hồi từ corpus kiểm thử');
    expect(response.body.sources).toEqual([expect.objectContaining({ id: 'BR-BOK-05' })]);
    expect(bookings.calls).toHaveLength(0);
    expect(policyRetriever.calls).toEqual(['Chính sách hủy sân thế nào?']);
    expect(assistant.seen[0]!.candidates[0]!.sources).toEqual([expect.objectContaining({ id: 'BR-BOK-05' })]);
  });

  it('retrieves only the caller own nearest booking and cites that source', async () => {
    const assistant = new FakeSupportAssistant();
    const bookings = new FakeBookingClient();
    const app = createApp({ supportAssistant: assistant, bookingClient: bookings });
    const authorization = playerAuthorization();

    const response = await request(app).post('/assistant/chat').set('Authorization', authorization)
      .send({ question: 'Booking gần nhất của tôi khi nào?' }).expect(200);

    expect(response.body.answer).toContain('Sân Gần');
    expect(response.body.sources).toEqual([expect.objectContaining({ id: 'own-booking' })]);
    expect(bookings.calls).toEqual([authorization]);
    expect(assistant.seen[0]!.candidates[0]!.answer).toContain('Sân Gần');
  });

  it('does not retrieve or expose another user data', async () => {
    const assistant = new FakeSupportAssistant();
    const bookings = new FakeBookingClient();
    const app = createApp({ supportAssistant: assistant, bookingClient: bookings });

    const response = await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Booking của user B khi nào?' }).expect(200);

    expect(response.body.answer).toContain('không thể truy xuất dữ liệu của người dùng khác');
    expect(bookings.calls).toHaveLength(0);
    expect(assistant.seen).toHaveLength(0);
  });

  it('guides an explicit cancellation request to the standard flow without acting', async () => {
    const assistant = new FakeSupportAssistant();
    const bookings = new FakeBookingClient();
    const app = createApp({ supportAssistant: assistant, bookingClient: bookings });

    const response = await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Hủy giúp tôi booking này' }).expect(200);

    expect(response.body.answer).toContain('không thể tự hủy');
    expect(response.body.actionPath).toBe('/players/me/bookings');
    expect(bookings.calls).toHaveLength(0);
    expect(assistant.seen).toHaveLength(0);
    await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Hủy booking X' }).expect(200).expect(({ body }) => {
        expect(body.actionPath).toBe('/players/me/bookings');
      });
  });

  it('returns the short busy fallback if Gemini is unavailable', async () => {
    const app = createApp({
      bookingClient: new FakeBookingClient(),
      supportAssistant: { selectAnswer: async () => { throw new Error('quota'); } },
    });

    const response = await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Chính sách hủy sân thế nào?' }).expect(200);

    expect(response.body).toEqual({
      answer: 'Trợ lý tạm bận, bạn vui lòng thử lại sau.',
      sources: [],
      source: 'fallback',
    });
  });

  it('keeps a booking-source outage distinct from the Gemini busy fallback', async () => {
    const app = createApp({
      bookingClient: { getMyBookings: async () => { throw new Error('venue 503'); } },
      supportAssistant: new FakeSupportAssistant(),
    });

    const response = await request(app).post('/assistant/chat').set('Authorization', playerAuthorization())
      .send({ question: 'Booking gần nhất của tôi khi nào?' }).expect(200);

    expect(response.body.answer).toContain('Không thể tải dữ liệu booking');
    expect(response.body.actionPath).toBe('/players/me/bookings');
    expect(response.body.answer).not.toContain('Trợ lý tạm bận');
  });
});
