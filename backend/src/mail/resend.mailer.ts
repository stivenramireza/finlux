import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type {
  MailLocale,
  MailerPort,
  SendPasswordResetEmailArgs,
} from './mailer.port.js';

/** Default sender when `RESEND_FROM` is unset (Resend sandbox sender). */
const DEFAULT_FROM = 'Finlux <onboarding@resend.dev>';

/** Rendered email parts (no secrets beyond the link embedded in the body). */
interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Localized copy builders (Spanish default, English by context). */
const COPY: Record<MailLocale, (resetUrl: string) => RenderedEmail> = {
  es: (resetUrl) => ({
    subject: 'Restablece tu contraseña de Finlux',
    text: [
      'Recibimos una solicitud para restablecer tu contraseña de Finlux.',
      '',
      'Abre este enlace para elegir una nueva contraseña:',
      resetUrl,
      '',
      'El enlace caduca en 5 minutos y solo puede usarse una vez.',
      'Si no solicitaste esto, puedes ignorar este correo con tranquilidad.',
    ].join('\n'),
    html: [
      '<p>Recibimos una solicitud para restablecer tu contraseña de Finlux.</p>',
      `<p><a href="${resetUrl}">Elige una nueva contraseña</a></p>`,
      '<p>El enlace caduca en 5 minutos y solo puede usarse una vez.</p>',
      '<p>Si no solicitaste esto, puedes ignorar este correo con tranquilidad.</p>',
    ].join(''),
  }),
  en: (resetUrl) => ({
    subject: 'Reset your Finlux password',
    text: [
      'We received a request to reset your Finlux password.',
      '',
      'Open this link to choose a new password:',
      resetUrl,
      '',
      'The link expires in 5 minutes and can be used only once.',
      "If you didn't request this, you can safely ignore this email.",
    ].join('\n'),
    html: [
      '<p>We received a request to reset your Finlux password.</p>',
      `<p><a href="${resetUrl}">Choose a new password</a></p>`,
      '<p>The link expires in 5 minutes and can be used only once.</p>',
      "<p>If you didn't request this, you can safely ignore this email.</p>",
    ].join(''),
  }),
};

/**
 * Renders the password-reset email body for a given locale. Pure (no I/O, no
 * logging), so tests can assert the subject/body and that the link is built
 * from `APP_BASE_URL` without any network call.
 */
export function renderPasswordResetEmail(
  resetUrl: string,
  locale: MailLocale = 'es',
): RenderedEmail {
  return (COPY[locale] ?? COPY.es)(resetUrl);
}

/**
 * {@link MailerPort} implementation backed by Resend. Finlux's first
 * outbound-email capability. Reads `RESEND_API_KEY` / `RESEND_FROM` by key name
 * via `ConfigService`. Never logs the reset link/token or a plaintext PII
 * record of the recipient; send failures are logged generically.
 */
@Injectable()
export class ResendMailer implements MailerPort {
  private readonly logger = new Logger(ResendMailer.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    this.from = this.configService.get<string>('RESEND_FROM') ?? DEFAULT_FROM;
    this.resend = new Resend(apiKey);
  }

  async sendPasswordResetEmail(
    args: SendPasswordResetEmailArgs,
  ): Promise<void> {
    const { subject, html, text } = renderPasswordResetEmail(
      args.resetUrl,
      args.locale ?? 'es',
    );

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: args.to,
      subject,
      html,
      text,
    });

    if (error) {
      // Log generically: no recipient, no link/token, no provider internals.
      this.logger.error('Failed to send password-reset email.');
      throw new Error('Failed to send password-reset email.');
    }
  }
}
