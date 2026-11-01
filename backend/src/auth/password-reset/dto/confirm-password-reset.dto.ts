import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Input for `POST /auth/password-reset/confirm`: the raw reset token (from the
 * email link) and the new password. The password policy is identical to
 * `RegisterDto` (Requirement 4.3): minimum 8 characters with at least one
 * uppercase letter, one lowercase letter, one digit, and one special character.
 *
 * Note on error semantics: both a policy-violating password and an
 * invalid/expired/used token resolve to a generic `400` (indistinguishable, no
 * oracle — Requirement 4.4). The `token` here is only checked for presence; its
 * validity is resolved server-side.
 */
export class ConfirmPasswordResetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128)
  @Matches(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/[0-9]/, { message: 'Password must contain at least one digit' })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character',
  })
  password: string;
}
