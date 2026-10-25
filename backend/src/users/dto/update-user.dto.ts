/** Partial update for a user. `email` is treated as immutable here. */
export interface UpdateUserDto {
  displayName?: string | null;
  defaultCurrency?: string;
}
