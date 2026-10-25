import { IsEmail, IsString, MaxLength } from 'class-validator';

/**
 * Login input. Credentials are verified by the auth service; any failure
 * (unknown email or wrong password) yields an identical generic 401, so no
 * password policy is enforced here beyond basic shape validation.
 */
export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
