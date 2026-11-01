import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';

// Mock the Resend SDK so no network call happens and we can inspect the payload.
type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};
const sendMock = vi.fn<(payload: unknown) => Promise<SendResult>>(() =>
  Promise.resolve({ data: { id: 'email-1' }, error: null }),
);
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(public readonly apiKey: string) {}
  },
}));

const { ResendMailer, renderPasswordResetEmail } =
  await import('./resend.mailer.js');

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (name: string) => values[name] } as unknown as ConfigService;
}

describe('renderPasswordResetEmail', () => {
  it('builds Spanish copy by default with the reset link and 5-min notice', () => {
    const rendered = renderPasswordResetEmail(
      'http://localhost:3000/reset-password?token=abc',
    );
    expect(rendered.subject).toMatch(/contraseña/i);
    expect(rendered.text).toContain(
      'http://localhost:3000/reset-password?token=abc',
    );
    expect(rendered.text).toMatch(/5 minutos/);
    expect(rendered.html).toContain(
      'http://localhost:3000/reset-password?token=abc',
    );
  });

  it('builds English copy when locale is en', () => {
    const rendered = renderPasswordResetEmail(
      'http://localhost:3000/reset-password?token=abc',
      'en',
    );
    expect(rendered.subject).toMatch(/password/i);
    expect(rendered.text).toMatch(/5 minutes/);
  });
});

describe('ResendMailer', () => {
  beforeEach(() => {
    sendMock.mockClear();
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('sends with the correct to/from/subject and a link from APP_BASE_URL', async () => {
    const mailer = new ResendMailer(
      makeConfig({ RESEND_FROM: 'Finlux <onboarding@resend.dev>' }),
    );

    await mailer.sendPasswordResetEmail({
      to: 'user@example.com',
      resetUrl: 'http://localhost:3000/reset-password?token=raw-token',
      locale: 'en',
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(payload.from).toBe('Finlux <onboarding@resend.dev>');
    expect(payload.to).toBe('user@example.com');
    expect(payload.subject).toMatch(/password/i);
    expect(payload.text).toContain(
      'http://localhost:3000/reset-password?token=raw-token',
    );
  });

  it('never logs the token/link when a send fails', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'provider boom' },
    });
    const mailer = new ResendMailer(makeConfig({}));
    // Spy on the private Nest logger instance.
    const logger = (mailer as unknown as { logger: { error: unknown } }).logger;
    const errorSpy = vi
      .spyOn(logger as { error: (m: string) => void }, 'error')
      .mockImplementation(() => undefined);

    await expect(
      mailer.sendPasswordResetEmail({
        to: 'user@example.com',
        resetUrl: 'http://localhost:3000/reset-password?token=SECRET-TOKEN',
      }),
    ).rejects.toThrow();

    for (const call of errorSpy.mock.calls) {
      const line = String(call[0]);
      expect(line).not.toContain('SECRET-TOKEN');
      expect(line).not.toContain('user@example.com');
    }
  });
});
