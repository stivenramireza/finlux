import { z } from 'zod';
import {
  TransactionCurrency,
  TransactionType,
} from '../../transactions/entities/transaction.entity.js';

/** The canonical shape every amount must end up as: a plain decimal string. */
const AMOUNT_PATTERN = /^\d+(\.\d{1,4})?$/;

/**
 * Coerces a model-supplied `amount` into a plain decimal **string** WITHOUT
 * doing any arithmetic or ever using a float as the final value.
 *
 * Gemini occasionally emits `amount` with the wrong JSON *shape* — a number
 * (`20`, `20.5`), or a single-property wrapper object (`{"value":"20"}`,
 * `{"amount":20}`) — instead of the plain decimal string the downstream
 * `POST /transactions` contract requires. This normalizes only the *shape*;
 * the resulting string is then validated by the same pattern/positivity rules
 * as before, so precision is preserved end to end (money stays a decimal
 * string, never a float).
 *
 * Returns `null` for inputs we cannot safely normalize, so the subsequent
 * string validation produces a clear error rather than a confusing one.
 */
function canonicalizeAmount(input: unknown): string | null {
  if (typeof input === 'string') {
    // Normal case: trim incidental whitespace; validated by the pattern below.
    return input.trim();
  }
  if (typeof input === 'number') {
    return numberToDecimalString(input);
  }
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    // Accept a single-property wrapper object with a conventional key.
    const record = input as Record<string, unknown>;
    for (const key of ['value', 'amount'] as const) {
      if (key in record) {
        const inner = record[key];
        if (typeof inner === 'string') {
          return inner.trim();
        }
        if (typeof inner === 'number') {
          return numberToDecimalString(inner);
        }
      }
    }
  }
  return null;
}

/**
 * Converts a finite JS number into a plain decimal string (no scientific
 * notation) with at most 4 fractional digits, or `null` if it cannot be
 * represented exactly within that scale. This is a shape conversion only — it
 * never becomes the stored money value beyond the validated string it yields.
 */
function numberToDecimalString(value: number): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  // `toFixed(4)` renders without scientific notation and bounds the scale to 4.
  const fixed = value.toFixed(4);
  // Guard against silent rounding: the number must already fit in <= 4 dp.
  if (Number.parseFloat(fixed) !== value) {
    return null;
  }
  // Trim trailing fractional zeros (and a dangling dot) for a canonical form;
  // the pattern below still accepts up to 4 fractional digits.
  return fixed.replace(/\.?0+$/, '');
}

/**
 * Positive decimal string with at most 4 fractional digits (matches the
 * `numeric(19,4)` column). Tolerant of the model's occasional wrong *shape*
 * (number or single-key wrapper object) via a pre-validation coercion to the
 * canonical decimal string; the validation rules themselves are unchanged.
 */
export const amountSchema = z.preprocess(
  (input) => canonicalizeAmount(input) ?? input,
  z
    .string({ message: 'amount must be a decimal string, e.g. "20.00"' })
    .max(25)
    .regex(
      AMOUNT_PATTERN,
      'amount must be a decimal with at most 4 fractional digits',
    )
    .regex(/[1-9]/, 'amount must be strictly positive'),
);

/** A `YYYY-MM-DD` calendar day. */
export const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

/** Read-only view of a transaction returned to the agent. */
export const transactionOutputSchema = z.object({
  id: z.string(),
  amount: z.string(),
  type: z.enum(TransactionType),
  currency: z.enum(TransactionCurrency),
  date: z.string(),
  description: z.string().nullable(),
});
