import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';

/**
 * End-to-end proof of the password-history (no-reuse) rule against a REAL
 * Postgres, driven through the password-reset confirm endpoint (the
 * set-password event this feature guards). The Resend mailer is replaced by a
 * fake that captures the reset link/token (CI never sends real email). Asserts:
 *  - register → reset to a brand-new password succeeds;
 *  - attempting to reset back to a recent / just-set password → 400 reuse;
 *  - after N+1 distinct resets, the oldest password leaves the window and is
 *    reusable again (window of N);
 *  - at rest the DB stores bcrypt hashes, never plaintext.
 *
 * `PASSWORD_HISTORY_DEPTH` is fixed to a small N so the window boundary is
 * deterministic; the per-account cooldown is ~0 so back-to-back reset requests
 * are not suppressed.
 */

const PORT = 3996;
const HISTORY_DEPTH = 3;

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.BIDX_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.PASSWORD_RESET_REQUEST_COOLDOWN = '1ms';
process.env.PASSWORD_RESET_TOKEN_TTL = '5m';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.PASSWORD_HISTORY_DEPTH = String(HISTORY_DEPTH);

const { initCryptoKeys, resetCryptoKeysForTest } =
  await import('../src/crypto/crypto-keys.js');
resetCryptoKeysForTest();
initCryptoKeys((name) => process.env[name]);

const { AppModule } = await import('../src/app.module.js');
const { MAILER } = await import('../src/mail/mailer.port.js');
type SendArgs = import('../src/mail/mailer.port.js').SendPasswordResetEmailArgs;

/** Fake mailer: records each send so tests can pull the reset link/token. */
class FakeMailer {
  readonly sent: SendArgs[] = [];
  sendPasswordResetEmail(args: SendArgs): Promise<void> {
    this.sent.push(args);
    return Promise.resolve();
  }
  lastTokenFor(): string | null {
    const url = this.sent[this.sent.length - 1]?.resetUrl;
    if (!url) {
      return null;
    }
    return new URL(url).searchParams.get('token');
  }
}

/** Waits until the fake mailer has recorded `count` sends (fire-and-forget). */
async function waitForSends(mailer: FakeMailer, count: number): Promise<void> {
  for (let i = 0; i < 50 && mailer.sent.length < count; i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

function asBody<T>(res: request.Response): T {
  return res.body as T;
}

describe('Password history / no-reuse (e2e)', () => {
  let app: INestApplication<App>;
  let base: string;
  let dataSource: DataSource;
  let mailer: FakeMailer;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    mailer = new FakeMailer();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(PORT);
    base = `http://127.0.0.1:${PORT}`;
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized && createdUserIds.length > 0) {
      await dataSource.query('DELETE FROM "users" WHERE id = ANY($1)', [
        createdUserIds,
      ]);
    }
    await app?.close();
  });

  const register = async (email: string, password: string): Promise<string> => {
    const res = await request(base)
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    const id = asBody<{ id: string }>(res).id;
    createdUserIds.push(id);
    return id;
  };

  /** Requests a reset and returns the captured single-use token. */
  const requestResetToken = async (email: string): Promise<string> => {
    const before = mailer.sent.length;
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email })
      .expect(200);
    await waitForSends(mailer, before + 1);
    const token = mailer.lastTokenFor();
    expect(token).toBeTruthy();
    return token as string;
  };

  it('register → reset to a brand-new password succeeds', async () => {
    const email = `ph-new-${Date.now()}@example.com`;
    await register(email, 'S3cur3P@ss0');

    const token = await requestResetToken(email);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'Br4nd!New1' })
      .expect(200);

    // The new password logs in; the old one no longer works.
    await request(base)
      .post('/auth/login')
      .send({ email, password: 'Br4nd!New1' })
      .expect(200);
    await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss0' })
      .expect(401);
  });

  it('reusing the just-set (current) password is rejected with a reuse 400', async () => {
    const email = `ph-current-${Date.now()}@example.com`;
    await register(email, 'S3cur3P@ss0');

    // First reset to a new password.
    let token = await requestResetToken(email);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'Fr3sh!Pass1' })
      .expect(200);

    // Now try to reset back to the just-set password → reuse 400 with a
    // distinctive, non-generic message.
    token = await requestResetToken(email);
    const res = await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'Fr3sh!Pass1' })
      .expect(400);
    expect(asBody<{ message: string }>(res).message).toMatch(/used this/i);

    // The rejected password did not take effect; it still logs in with the
    // actual current one (the reuse candidate IS the current one here).
    await request(base)
      .post('/auth/login')
      .send({ email, password: 'Fr3sh!Pass1' })
      .expect(200);
  });

  it('reusing the original (registration) password is rejected within the window', async () => {
    const email = `ph-orig-${Date.now()}@example.com`;
    const original = 'Or1g!nalPass';
    await register(email, original);

    const token = await requestResetToken(email);
    // The original password is still within the N-window (it is the oldest of
    // the current {original} history).
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: original })
      .expect(400);
  });

  it('after N+1 distinct resets, the oldest password is reusable again', async () => {
    const email = `ph-window-${Date.now()}@example.com`;
    // History starts with P0 (registration). Depth = HISTORY_DEPTH (3).
    const p0 = 'Wind0w!Pass0';
    await register(email, p0);

    // Perform HISTORY_DEPTH distinct resets so P0 is pushed out of the window.
    // After each reset the history holds the last N hashes. Starting history:
    // {P0}. We reset to P1, P2, P3 → history becomes {P3,P2,P1} (P0 pruned).
    const passwords = ['Wind0w!Pass1', 'Wind0w!Pass2', 'Wind0w!Pass3'];
    for (const pwd of passwords) {
      const token = await requestResetToken(email);
      await request(base)
        .post('/auth/password-reset/confirm')
        .send({ token, password: pwd })
        .expect(200);
    }

    // P0 has now left the window (N = 3, current window is {P3,P2,P1}), so it
    // is reusable again.
    const token = await requestResetToken(email);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: p0 })
      .expect(200);
    await request(base)
      .post('/auth/login')
      .send({ email, password: p0 })
      .expect(200);
  });

  it('a reuse rejection does not consume the reset token (retry on the same link)', async () => {
    const email = `ph-retry-${Date.now()}@example.com`;
    await register(email, 'R3try!Pass0');

    // Reset to a new password so the current one is a known reuse candidate.
    let token = await requestResetToken(email);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'R3try!Pass1' })
      .expect(200);

    // Request one fresh token, then try a reused password (→ 400) and retry a
    // genuinely new password on the SAME token (→ 200), proving the reuse
    // rejection did not burn the token.
    token = await requestResetToken(email);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'R3try!Pass1' }) // reuse → 400, token stays live
      .expect(400);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'R3try!Pass2' }) // fresh → 200 on the same token
      .expect(200);
  });

  it('the password_history table stores bcrypt hashes, never plaintext', async () => {
    const email = `ph-hash-${Date.now()}@example.com`;
    const plaintext = 'H4sh!Check0';
    const userId = await register(email, plaintext);

    const rows: Array<{ password_hash: string }> = await dataSource.query(
      'SELECT password_hash FROM "password_history" WHERE user_id = $1',
      [userId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      // bcrypt hashes start with $2 and never contain the plaintext.
      expect(r.password_hash.startsWith('$2')).toBe(true);
      expect(r.password_hash).not.toContain(plaintext);
    }
  });
});
