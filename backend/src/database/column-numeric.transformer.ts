import { ValueTransformer } from 'typeorm';

/**
 * Maps a PostgreSQL `numeric`/`decimal` column to a decimal-safe `string`
 * representation in the domain layer and back.
 *
 * Money must never be represented as a JavaScript `number`: IEEE-754 binary
 * floating point cannot represent many decimal fractions exactly (e.g.
 * `0.1 + 0.2 !== 0.3`), which silently corrupts monetary math. We therefore
 * keep monetary amounts as strings end-to-end; any arithmetic should be done
 * with a decimal library on top of these strings, never with `number`.
 *
 * - `to` (entity → DB): accepts a string and passes it through unchanged so the
 *   driver sends an exact decimal literal. `null`/`undefined` are preserved.
 * - `from` (DB → entity): the `pg` driver returns `numeric` as a string; we
 *   return it as-is. `null` is preserved.
 */
export class ColumnNumericTransformer implements ValueTransformer {
  to(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return value;
  }

  from(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return value;
  }
}

/** Shared singleton instance for use in `@Column({ transformer })`. */
export const columnNumericTransformer = new ColumnNumericTransformer();
