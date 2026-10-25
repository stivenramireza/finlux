import {
  registerDecorator,
  IsEnum,
  IsOptional,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { TransactionType } from '../entities/transaction.entity.js';
import { IsCalendarDay } from './is-calendar-day.validator.js';
import type { TransactionFilter } from './transaction-filter.dto.js';

/**
 * Cross-field check: when both bounds are present, `dateFrom` must not be after
 * `dateTo`. An inverted range is almost always a client bug, so it is rejected
 * with `400` rather than silently returning an empty list. Lexicographic string
 * comparison is correct for the fixed-width `YYYY-MM-DD` form.
 */
function IsNotInvertedRange(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotInvertedRange',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const dto = args.object as ListTransactionsQueryDto;
          if (
            typeof dto.dateFrom === 'string' &&
            typeof dto.dateTo === 'string'
          ) {
            return dto.dateFrom <= dto.dateTo;
          }
          return true;
        },
        defaultMessage(): string {
          return 'dateFrom must not be after dateTo';
        },
      },
    });
  };
}

/** Validated query params for `GET /transactions`; maps to `TransactionFilter`. */
export class ListTransactionsQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  /** Inclusive lower bound, a real `YYYY-MM-DD` calendar day. */
  @IsOptional()
  @IsCalendarDay()
  dateFrom?: string;

  /** Inclusive upper bound, a real `YYYY-MM-DD` calendar day. */
  @IsOptional()
  @IsCalendarDay()
  @IsNotInvertedRange()
  dateTo?: string;

  /** Adapts the validated query into the service's internal filter shape. */
  toFilter(): TransactionFilter {
    return {
      type: this.type,
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
    };
  }
}
