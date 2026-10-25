/** Input for creating a user. */
export interface CreateUserDto {
  email: string;
  displayName?: string | null;
  /** bcrypt hash of the password (never plaintext). */
  password: string;
}
