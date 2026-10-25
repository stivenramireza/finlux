import {
  TransactionCurrency,
  TransactionType,
} from '../entities/transaction.entity.js';

/** Partial update for a transaction. `amount` stays a decimal string. */
export interface UpdateTransactionDto {
  amount?: string;
  type?: TransactionType;
  currency?: TransactionCurrency;
  date?: string;
  description?: string | null;
}
