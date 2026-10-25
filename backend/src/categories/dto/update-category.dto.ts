/** Partial update for a user-owned category. */
export interface UpdateCategoryDto {
  name?: string;
  kind?: string | null;
  icon?: string | null;
}
