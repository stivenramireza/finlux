import { TransactionType } from '../entities/transaction.entity.js';

/** Optional filters for listing transactions; all AND-ed with the user scope. */
export interface TransactionFilter {
  type?: TransactionType;
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  dateTo?: string;
}
