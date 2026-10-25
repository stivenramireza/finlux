/** Partial update for an account. */
export interface UpdateAccountDto {
  name?: string;
  type?: string | null;
  currency?: string | null;
}
