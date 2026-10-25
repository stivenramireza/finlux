/** Input for creating an account. Owner (`userId`) is passed separately. */
export interface CreateAccountDto {
  name: string;
  type?: string | null;
  currency?: string | null;
}
