import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { TransactionType } from '../../transactions/entities/transaction.entity.js';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';
import { calendarDaySchema, transactionOutputSchema } from './schemas.js';

/**
 * Lists the caller's transactions, optionally filtered by type and/or an
 * inclusive date range. Reaches the data ONLY via the transaction HTTP API,
 * forwarding the caller's JWT from the request context (Layer 1). `userId` /
 * token are never tool inputs.
 */
export function createListTransactionsTool(client: TransactionApiClient) {
  return createTool({
    id: 'list-transactions',
    description:
      "List the caller's own transactions, optionally filtered by type (income/expense) and/or an inclusive date range (YYYY-MM-DD).",
    inputSchema: z.object({
      type: z.enum(TransactionType).optional(),
      dateFrom: calendarDaySchema.optional(),
      dateTo: calendarDaySchema.optional(),
    }),
    outputSchema: z.object({ transactions: z.array(transactionOutputSchema) }),
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
      return {
        transactions: rows.map((tx) => ({
          id: tx.id,
          amount: tx.amount,
          type: tx.type,
          currency: tx.currency,
          date: tx.date,
          description: tx.description,
        })),
      };
    },
  });
}
