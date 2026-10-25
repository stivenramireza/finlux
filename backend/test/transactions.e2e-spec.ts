import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';

/**
 * End-to-end coverage for the transactions HTTP API. Boots the full app (so the
 * global ValidationPipe and the JWT strategy from AuthModule are active) and
 * drives the endpoints over HTTP with real bearer tokens. Requires a reachable
 * Postgres (the dev container); test users/transactions are cleaned up at the
 * end.
 */

const RANDOM_UUID = '99999999-9999-4999-8999-999999999999';
const NON_UUID = 'not-a-uuid';

const VALID_BODY = {
  amount: '20.5000',
  type: 'expense',
  currency: 'USD',
  date: '2025-01-15',
  description: 'Lunch',
};

interface TransactionResponse {
  id: string;
  userId: string;
  amount: string;
  type: string;
  currency: string;
  date: string;
  description: string | null;
}

interface LoginResponse {
  accessToken: string;
  user: { id: string };
}

/** Narrow a supertest response body to a known shape for typed assertions. */
function asBody<T>(res: request.Response): T {
  return res.body as T;
}

interface AuthedUser {
  token: string;
  userId: string;
  email: string;
}

describe('Transactions API (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;
  let dataSource: DataSource;
  let userA: AuthedUser;
  let userB: AuthedUser;
  const createdUserIds: string[] = [];

  async function registerAndLogin(
    password = 'Str0ng!Pass',
  ): Promise<AuthedUser> {
    const email = `e2e-tx-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const loginBody = asBody<LoginResponse>(login);
    const token = loginBody.accessToken;
    const userId = loginBody.user.id;
    createdUserIds.push(userId);
    return { token, userId, email };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror the global pipe configured in main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwt = app.get(JwtService);
    dataSource = app.get(DataSource);

    userA = await registerAndLogin();
    userB = await registerAndLogin();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized && createdUserIds.length > 0) {
      // ON DELETE CASCADE removes the users' transactions and sessions.
      await dataSource.query('DELETE FROM "user" WHERE id = ANY($1)', [
        createdUserIds,
      ]);
    }
    await app?.close();
  });

  const auth = (token: string) => `Bearer ${token}`;

  describe('authentication required (401)', () => {
    const expiredToken = () =>
      jwt.sign(
        { sub: RANDOM_UUID, email: 'ghost@example.com' },
        { expiresIn: '-1h' },
      );

    it.each([
      ['post', '/transactions'],
      ['get', '/transactions'],
      ['get', `/transactions/${RANDOM_UUID}`],
      ['put', `/transactions/${RANDOM_UUID}`],
      ['delete', `/transactions/${RANDOM_UUID}`],
    ] as const)('%s %s with no token → 401', async (method, path) => {
      await request(app.getHttpServer())[method](path).expect(401);
    });

    it('rejects a malformed bearer token → 401', async () => {
      await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', auth('garbage.token.value'))
        .expect(401);
    });

    it('rejects an expired bearer token → 401', async () => {
      await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', auth(expiredToken()))
        .expect(401);
    });
  });

  describe('happy path create → list → get → update → delete', () => {
    it('round-trips a transaction with amount as a string and a Location header', async () => {
      // create
      const created = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(userA.token))
        .send(VALID_BODY)
        .expect(201);

      const createdBody = asBody<TransactionResponse>(created);
      const id = createdBody.id;
      expect(typeof createdBody.amount).toBe('string');
      expect(createdBody.amount).toBe('20.5000');
      expect(createdBody.userId).toBe(userA.userId);
      expect(created.headers.location).toBe(`/transactions/${id}`);

      // list
      const list = await request(app.getHttpServer())
        .get('/transactions')
        .set('Authorization', auth(userA.token))
        .expect(200);
      const listBody = asBody<TransactionResponse[]>(list);
      expect(Array.isArray(listBody)).toBe(true);
      expect(listBody.some((t) => t.id === id)).toBe(true);

      // get
      const fetched = await request(app.getHttpServer())
        .get(`/transactions/${id}`)
        .set('Authorization', auth(userA.token))
        .expect(200);
      const fetchedBody = asBody<TransactionResponse>(fetched);
      expect(fetchedBody.id).toBe(id);
      expect(typeof fetchedBody.amount).toBe('string');

      // update (full replace, drops description → null)
      const updated = await request(app.getHttpServer())
        .put(`/transactions/${id}`)
        .set('Authorization', auth(userA.token))
        .send({
          amount: '99.0000',
          type: 'income',
          currency: 'COP',
          date: '2025-03-01',
        })
        .expect(200);
      const updatedBody = asBody<TransactionResponse>(updated);
      expect(updatedBody.amount).toBe('99.0000');
      expect(updatedBody.type).toBe('income');
      expect(updatedBody.currency).toBe('COP');
      expect(updatedBody.date).toBe('2025-03-01');
      expect(updatedBody.description).toBeNull();

      // delete
      await request(app.getHttpServer())
        .delete(`/transactions/${id}`)
        .set('Authorization', auth(userA.token))
        .expect(204);

      // subsequent get → 404
      await request(app.getHttpServer())
        .get(`/transactions/${id}`)
        .set('Authorization', auth(userA.token))
        .expect(404);
    });

    it('returns an empty array (200) when there are no matches', async () => {
      const res = await request(app.getHttpServer())
        .get('/transactions')
        .query({ dateFrom: '1999-01-01', dateTo: '1999-12-31' })
        .set('Authorization', auth(userA.token))
        .expect(200);
      expect(asBody<TransactionResponse[]>(res)).toEqual([]);
    });
  });

  describe('validation (400)', () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(userA.token))
        .send(body);

    it('rejects an invalid type', async () => {
      await post({ ...VALID_BODY, type: 'transfer' }).expect(400);
    });

    it('rejects an invalid currency', async () => {
      await post({ ...VALID_BODY, currency: 'EUR' }).expect(400);
    });

    it('rejects a non-positive amount (zero)', async () => {
      await post({ ...VALID_BODY, amount: '0.0000' }).expect(400);
    });

    it('rejects an amount with 5 decimals', async () => {
      await post({ ...VALID_BODY, amount: '1.00000' }).expect(400);
    });

    it('rejects an impossible calendar date', async () => {
      await post({ ...VALID_BODY, date: '2025-02-30' }).expect(400);
    });

    it('rejects an unknown extra field', async () => {
      await post({ ...VALID_BODY, foo: 'bar' }).expect(400);
    });

    it('rejects an inverted date range on list', async () => {
      await request(app.getHttpServer())
        .get('/transactions')
        .query({ dateFrom: '2025-12-31', dateTo: '2025-01-01' })
        .set('Authorization', auth(userA.token))
        .expect(400);
    });

    it('rejects an invalid type filter on list', async () => {
      await request(app.getHttpServer())
        .get('/transactions')
        .query({ type: 'transfer' })
        .set('Authorization', auth(userA.token))
        .expect(400);
    });

    it('rejects a non-uuid :id → 400 (distinct from 404)', async () => {
      await request(app.getHttpServer())
        .get(`/transactions/${NON_UUID}`)
        .set('Authorization', auth(userA.token))
        .expect(400);
    });
  });

  describe('per-user isolation (404, no disclosure)', () => {
    let userBTxId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/transactions')
        .set('Authorization', auth(userB.token))
        .send(VALID_BODY)
        .expect(201);
      userBTxId = asBody<TransactionResponse>(created).id;
    });

    it("user A GET on user B's id → 404, identical to a random uuid", async () => {
      await request(app.getHttpServer())
        .get(`/transactions/${userBTxId}`)
        .set('Authorization', auth(userA.token))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/transactions/${RANDOM_UUID}`)
        .set('Authorization', auth(userA.token))
        .expect(404);
    });

    it("user A PUT on user B's id → 404", async () => {
      await request(app.getHttpServer())
        .put(`/transactions/${userBTxId}`)
        .set('Authorization', auth(userA.token))
        .send(VALID_BODY)
        .expect(404);
    });

    it("user A DELETE on user B's id → 404 (and B's tx survives)", async () => {
      await request(app.getHttpServer())
        .delete(`/transactions/${userBTxId}`)
        .set('Authorization', auth(userA.token))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/transactions/${userBTxId}`)
        .set('Authorization', auth(userB.token))
        .expect(200);
    });
  });
});
