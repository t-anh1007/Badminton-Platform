import { afterEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';

const savedJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (savedJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = savedJwtSecret;
});

describe('community authentication', () => {
  it('fails closed instead of accepting the historical development JWT secret', async () => {
    delete process.env.JWT_SECRET;
    const token = jwt.sign(
      { sub: 'b73539c1-9c9d-4462-80ae-3bcd62c20b95', roles: ['player'], type: 'access' },
      'change-me-in-real-env',
    );
    const app = createApp({
      bookingClient: { getMyBookings: async () => ({ upcoming: [], past: [] }) },
      supportAssistant: { selectAnswer: async () => 0 },
    });

    await request(app).post('/assistant/chat').set('Authorization', `Bearer ${token}`)
      .send({ question: 'Chính sách hủy sân thế nào?' }).expect(401);
  });
});
