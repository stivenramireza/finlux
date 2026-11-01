import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  TransactionCurrency,
  TransactionType,
} from '../../transactions/entities/transaction.entity.js';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';
import { calendarDaySchema } from './schemas.js';
import { subtractDecimalStrings, sumDecimalStrings } from './decimal.js';

/**
 * A per-currency breakdown. Figures are exact decimal strings (never floats);
 * currencies are never combined (no FX). `net` is `income − expense` (may be
 * negative), computed server-side so the agent never does the subtraction.
 */
const currencyGroup = z.object({
  currency: z.enum(TransactionCurrency),
  income: z.string(),
  expense: z.string(),
  net: z.string(),
  count: z.number().int(),
});

/**
 * Read-only aggregation over the caller's transactions, GROUPED BY CURRENCY.
 * Fetches rows via the transaction HTTP API (forwarding the caller's JWT), then
 * per currency returns the income sum, the expense sum, and the net balance
 * (income − expense) — all as exact decimal strings computed WITHOUT floating
 * point (BigInt minor units). Currencies are never summed together (no FX).
 * Token comes from the request context (Layer 1).
 *
 * This is the single grounded source for both totals (sums) and balances (the
 * subtraction), so the agent never has to do arithmetic itself.
 */
export function createSummarizeTransactionsTool(client: TransactionApiClient) {
  return createTool({
    id: 'summarize-transactions',
    description:
      "Summarize the caller's transactions grouped by currency, reporting per-currency income (sum of incomes), expense (sum of expenses), and net (income minus expense, the balance — may be negative), plus a count. Optionally filtered by an inclusive date range. Figures are exact decimal strings and are never combined across currencies.",
    inputSchema: z.object({
      dateFrom: calendarDaySchema.optional(),
      dateTo: calendarDaySchema.optional(),
    }),
    outputSchema: z.object({ byCurrency: z.array(currencyGroup) }),
    requestContextSchema,
    execute: async (inputData, context) => {
      const token = requireAccessToken(context);
      const rows = await client.list(
        {
          dateFrom: inputData.dateFrom,
          dateTo: inputData.dateTo,
        },
        token,
      );

      const groups = new Map<
        TransactionCurrency,
        { income: string[]; expense: string[]; count: number }
      >();
      for (const tx of rows) {
        const group = groups.get(tx.currency) ?? {
          income: [],
          expense: [],
          count: 0,
        };
        if (tx.type === TransactionType.INCOME) {
          group.income.push(tx.amount);
        } else {
          group.expense.push(tx.amount);
        }
        group.count += 1;
        groups.set(tx.currency, group);
      }

      const byCurrency = [...groups.entries()].map(([currency, group]) => {
        const income = sumDecimalStrings(group.income);
        const expense = sumDecimalStrings(group.expense);
        return {
          currency,
          income,
          expense,
          net: subtractDecimalStrings(income, expense),
          count: group.count,
        };
      });

      return { byCurrency };
    },
  });
}
