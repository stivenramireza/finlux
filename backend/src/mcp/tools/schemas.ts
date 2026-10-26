import { z } from 'zod';
import {
  TransactionCurrency,
  TransactionType,
} from '../../transactions/entities/transaction.entity.js';

/** Positive decimal string with at most 4 fractional digits (matches the column). */
export const amountSchema = z
  .string()
  .max(25)
  .regex(
    /^\d+(\.\d{1,4})?$/,
    'amount must be a decimal with at most 4 fractional digits',
  )
  .regex(/[1-9]/, 'amount must be strictly positive');

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
