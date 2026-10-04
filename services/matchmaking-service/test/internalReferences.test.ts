import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp({ matchmakerClient: { explain: async () => [] } });
const token = 'test-internal-token';
process.env.INTERNAL_SERVICE_TOKEN = token;

afterAll(async () => { await prisma.$disconnect(); });

describe('POST /internal/matches/references', () => {
  it('chặn khi thiếu hoặc sai token nội bộ', async () => {
    await request(app).post('/internal/matches/references').send({ matchIds: [randomUUID()] }).expect(401);
    await request(app).post('/internal/matches/references').set('x-internal-service-token', 'wrong-token-value-xx').send({ matchIds: [randomUUID()] }).expect(401);
  });

  it('từ chối body không hợp lệ', async () => {
    await request(app).post('/internal/matches/references').set('x-internal-service-token', token).send({ matchIds: ['not-a-uuid'] }).expect(400);
    await request(app).post('/internal/matches/references').set('x-internal-service-token', token).send({ matchIds: [] }).expect(400);
  });

  it('trả mã KEO cho kèo có thật, bỏ qua id không tồn tại', async () => {
    const match = await prisma.match.findFirst({ select: { id: true, businessCode: true } });
    const ids = [randomUUID(), ...(match ? [match.id] : [])];
    const response = await request(app).post('/internal/matches/references').set('x-internal-service-token', token).send({ matchIds: ids }).expect(200);
    expect(response.body.references).toEqual(match ? [{ id: match.id, businessCode: match.businessCode }] : []);
    if (match) expect(match.businessCode).toMatch(/^KEO-\d{8}$/);
  });
});
