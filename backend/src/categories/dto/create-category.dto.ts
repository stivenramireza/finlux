/** Input for creating a user-owned category. */
export interface CreateCategoryDto {
  name: string;
  kind?: string | null;
  icon?: string | null;
}
