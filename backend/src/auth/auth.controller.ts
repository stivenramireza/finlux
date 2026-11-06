import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { AuthService, type LoginResult } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { PasswordResetService } from './password-reset/password-reset.service.js';
import { RequestPasswordResetDto } from './password-reset/dto/request-password-reset.dto.js';
import { ConfirmPasswordResetDto } from './password-reset/dto/confirm-password-reset.dto.js';
import type { MailLocale } from '../mail/mailer.port.js';

/** Uniform, non-disclosing response for a password-reset request. */
const RESET_REQUEST_MESSAGE =
  "If an account exists for that email, we've sent reset instructions.";

/**
 * Uniform, non-disclosing response for registration (Requirement 1 /
 * Decision 1). Identical whether the email is new or already registered, so the
 * endpoint cannot be used to enumerate accounts.
 */
const REGISTER_MESSAGE =
  'If this email is new, your account has been created — you can now log in.';

/** Authentication endpoints: registration, login, and password reset. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /**
   * Registers a user — **non-disclosing** (Requirement 1 / Decision 1). Returns
   * the SAME generic body whether or not the email was already registered, and
   * never exposes the created record, its id, or `password`. Does not auto-login
   * or branch on which case occurred.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    await this.authService.register(dto);
    return { message: REGISTER_MESSAGE };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  /**
   * Starts a password reset. Returns the SAME body whether or not the email is
   * registered (non-disclosure, Requirement 2). The email (if any) is dispatched
   * after this response commits.
   */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<{ message: string }> {
    const locale = dto.locale ?? AuthController.resolveLocale(acceptLanguage);
    await this.passwordResetService.request(dto.email, locale);
    return { message: RESET_REQUEST_MESSAGE };
  }

  /**
   * Completes a password reset with a token + new password. Success is `200`;
   * an invalid/expired/used token OR a policy-violating password is a generic
   * `400` (indistinguishable — Requirement 4.4). No session is issued.
   */
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(
    @Body() dto: ConfirmPasswordResetDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.confirm(dto.token, dto.password);
    return { message: 'Your password has been reset. You can now log in.' };
  }

  /**
   * Picks the email locale from `Accept-Language` (English only when the client
   * prefers English); defaults to Spanish, consistent with the product.
   */
  private static resolveLocale(acceptLanguage?: string): MailLocale {
    if (acceptLanguage && /\ben\b/i.test(acceptLanguage.split(',')[0] ?? '')) {
      return 'en';
    }
    return 'es';
  }
}
