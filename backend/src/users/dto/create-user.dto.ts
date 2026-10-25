/** Input for creating a user. */
export interface CreateUserDto {
  email: string;
  displayName?: string | null;
}
