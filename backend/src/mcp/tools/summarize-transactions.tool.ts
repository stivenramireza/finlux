import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { TransactionCurrency } from '../../transactions/entities/transaction.entity.js';
import { TransactionType } from '../../transactions/entities/transaction.entity.js';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';
import { calendarDaySchema } from './schemas.js';
import { sumDecimalStrings } from './decimal.js';

/** A per-currency total (never summed across currencies). */
const currencyGroup = z.object({
  currency: z.enum(TransactionCurrency),
  total: z.string(),
  count: z.number().int(),
});

/**
 * Read-only aggregation over the caller's transactions, GROUPED BY CURRENCY.
 * Fetches rows via the transaction HTTP API (forwarding the caller's JWT), then
 * totals per currency as exact decimal strings computed WITHOUT floating point;
 * currencies are never summed together (no FX). Token comes from the request
 * context (Layer 1).
 */
export function createSummarizeTransactionsTool(client: TransactionApiClient) {
  return createTool({
    id: 'summarize-transactions',
    description:
      "Summarize the caller's transactions grouped by currency (optionally filtered by type and/or an inclusive date range). Totals are per-currency and never combined across currencies.",
    inputSchema: z.object({
      type: z.enum(TransactionType).optional(),
      dateFrom: calendarDaySchema.optional(),
      dateTo: calendarDaySchema.optional(),
    }),
    outputSchema: z.object({ byCurrency: z.array(currencyGroup) }),
    requestContextSchema,
    execute: async (inputData, context) => {
      const token = requireAccessToken(context);
      const rows = await client.list(
        {
          type: inputData.type,
          dateFrom: inputData.dateFrom,
          dateTo: inputData.dateTo,
        },
        token,
      );

      const groups = new Map<TransactionCurrency, string[]>();
      for (const tx of rows) {
        const list = groups.get(tx.currency) ?? [];
        list.push(tx.amount);
        groups.set(tx.currency, list);
      }

      const byCurrency = [...groups.entries()].map(([currency, amounts]) => ({
        currency,
        total: sumDecimalStrings(amounts),
        count: amounts.length,
      }));

      return { byCurrency };
    },
  });
}
