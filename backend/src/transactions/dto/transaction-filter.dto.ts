/** Optional filters for listing transactions; all AND-ed with the user scope. */
export interface TransactionFilter {
  accountId?: string;
  categoryId?: string;
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  dateFrom?: string;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  dateTo?: string;
  type?: string;
}
