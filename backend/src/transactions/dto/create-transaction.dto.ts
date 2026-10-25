import { TransactionType } from '../entities/transaction.entity.js';

/**
 * Input for creating a transaction. Owner (`userId`) is passed separately.
 * `amount` is a decimal string (never a number) to preserve precision.
 */
export interface CreateTransactionDto {
  accountId: string;
  amount: string;
  currency: string;
  type: TransactionType;
  /** Calendar day in `YYYY-MM-DD` form. */
  date: string;
  categoryId?: string | null;
  description?: string | null;
}
