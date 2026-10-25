/** Input for creating a user. */
export interface CreateUserDto {
  email: string;
  defaultCurrency: string;
  displayName?: string | null;
}
