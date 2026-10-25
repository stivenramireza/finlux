import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  TransactionCurrency,
  TransactionType,
} from '../entities/transaction.entity.js';
import { IsCalendarDay } from './is-calendar-day.validator.js';

/**
 * Input for creating a transaction (and, per the design, the full-replace body
 * for PUT). Owner (`userId`) is derived from the token, never the body.
 *
 * `amount` is validated and carried as a decimal string (never a JS number) to
 * preserve precision end to end.
 */
export class CreateTransactionDto {
  /**
   * A strictly positive decimal with at most 4 fractional digits, matching the
   * `numeric(19,4)` column. Validated as a string so precision is never lost to
   * float coercion (no `@IsNumber`/`@IsPositive`). Zero / all-zero mantissa is
   * rejected — the sign lives in `type`, so the amount itself is always `> 0`.
   */
  @IsString()
  @MaxLength(25)
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a decimal with at most 4 fractional digits',
  })
  @Matches(/[1-9]/, { message: 'amount must be strictly positive' })
  amount: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  /** Supported currency code (closed enum: COP | USD). */
  @IsEnum(TransactionCurrency)
  currency: TransactionCurrency;

  /** A real calendar day in `YYYY-MM-DD` form (e.g. `2025-02-30` is rejected). */
  @IsCalendarDay()
  date: string;

  /**
   * Optional free-text note. Trimmed; an empty string normalizes to `null` so
   * "blank" and "absent" converge. Bounded to 500 characters.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
