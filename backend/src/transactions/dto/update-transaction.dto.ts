import { TransactionType } from '../entities/transaction.entity.js';

/** Partial update for a transaction. `amount` stays a decimal string. */
export interface UpdateTransactionDto {
  accountId?: string;
  amount?: string;
  currency?: string;
  type?: TransactionType;
  date?: string;
  categoryId?: string | null;
  description?: string | null;
}
