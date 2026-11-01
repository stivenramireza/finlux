import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
import type { MailLocale } from '../../../mail/mailer.port.js';

/**
 * Input for `POST /auth/password-reset/request`. Only an email is required; an
 * optional `locale` selects the email language (defaults to Spanish, English by
 * context). The response is identical whether or not the email is registered
 * (non-disclosure, Requirement 2).
 */
export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsIn(['es', 'en'])
  locale?: MailLocale;
}
