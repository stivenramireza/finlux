import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { App } from 'supertest/types.js';

/**
 * End-to-end proof of the password-reset flow against a REAL Postgres, with the
 * Resend mailer replaced by a fake that captures the reset link (CI never sends
 * real email). Asserts:
 *  - non-disclosure: a registered vs unregistered request returns BYTE-IDENTICAL
 *    responses (status + body);
 *  - happy path: request → read the captured token → confirm → login with the
 *    new password works and the old password fails;
 *  - generic 400 for a bad token / weak password / malformed body;
 *  - single-use: a second confirm with the same token fails.
 *
 * Real 32-byte test keys are set BEFORE importing the app (entity transformers
 * read them at module load). The per-account cooldown is set very low so the
 * happy-path request isn't suppressed by an earlier request in the same run.
 */

const PORT = 3997;
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.BIDX_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.PASSWORD_RESET_REQUEST_COOLDOWN = '1ms';
process.env.PASSWORD_RESET_TOKEN_TTL = '5m';
process.env.APP_BASE_URL = 'http://localhost:3000';

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

describe('Password reset (e2e)', () => {
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

  const register = async (email: string, password: string) => {
    const res = await request(base)
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    createdUserIds.push(asBody<{ id: string }>(res).id);
  };

  it('request: registered vs unregistered → byte-identical responses', async () => {
    const email = `pr-nd-${Date.now()}@example.com`;
    await register(email, 'S3cur3P@ss');

    const registered = await request(base)
      .post('/auth/password-reset/request')
      .send({ email });
    const unregistered = await request(base)
      .post('/auth/password-reset/request')
      .send({ email: `missing-${Date.now()}@example.com` });

    expect(registered.status).toBe(unregistered.status);
    expect(registered.status).toBe(200);
    // Byte-identical body.
    expect(JSON.stringify(registered.body)).toBe(
      JSON.stringify(unregistered.body),
    );
  });

  it('happy path: request → confirm → new password logs in, old fails', async () => {
    const email = `pr-happy-${Date.now()}@example.com`;
    const oldPassword = 'S3cur3P@ss';
    const newPassword = 'N3w!Passw0rd';
    await register(email, oldPassword);

    const sendsBefore = mailer.sent.length;
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email })
      .expect(200);
    await waitForSends(mailer, sendsBefore + 1);

    const token = mailer.lastTokenFor();
    expect(token).toBeTruthy();

    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: newPassword })
      .expect(200);

    // New password works.
    await request(base)
      .post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    // Old password no longer works (generic 401).
    await request(base)
      .post('/auth/login')
      .send({ email, password: oldPassword })
      .expect(401);
  });

  it('single-use: a second confirm with the same token fails with 400', async () => {
    const email = `pr-single-${Date.now()}@example.com`;
    await register(email, 'S3cur3P@ss');

    const sendsBefore = mailer.sent.length;
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email })
      .expect(200);
    await waitForSends(mailer, sendsBefore + 1);
    const token = mailer.lastTokenFor();

    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'An0ther!Pass' })
      .expect(200);
    // Reusing the consumed token → generic 400.
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'Y3t!Another1' })
      .expect(400);
  });

  it('confirm: unknown/bad token → generic 400', async () => {
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token: 'this-token-does-not-exist', password: 'V4lid!Pass' })
      .expect(400);
  });

  it('confirm: policy-violating password → generic 400 (no oracle)', async () => {
    const email = `pr-weak-${Date.now()}@example.com`;
    await register(email, 'S3cur3P@ss');
    const sendsBefore = mailer.sent.length;
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email })
      .expect(200);
    await waitForSends(mailer, sendsBefore + 1);
    const token = mailer.lastTokenFor();

    // A valid token but a weak password is still a 400 (indistinguishable).
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ token, password: 'weak' })
      .expect(400);
  });

  it('request/confirm: malformed body → 400', async () => {
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email: 'not-an-email' })
      .expect(400);
    await request(base)
      .post('/auth/password-reset/request')
      .send({ email: 'x@example.com', extra: 'nope' })
      .expect(400);
    await request(base)
      .post('/auth/password-reset/confirm')
      .send({ password: 'V4lid!Pass' }) // missing token
      .expect(400);
  });
});
