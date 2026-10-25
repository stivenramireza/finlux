import {
  TransactionCurrency,
  TransactionType,
} from '../entities/transaction.entity.js';

/**
 * Input for creating a transaction. Owner (`userId`) is passed separately.
 * `amount` is a decimal string (never a number) to preserve precision.
 */
export interface CreateTransactionDto {
  amount: string;
  type: TransactionType;
  /** Supported currency code (closed enum: COP | USD). */
  currency: TransactionCurrency;
  /** Calendar day in `YYYY-MM-DD` form. */
  date: string;
  description?: string | null;
}
