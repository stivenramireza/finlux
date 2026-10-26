import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  TransactionCurrency,
  TransactionType,
} from '../../transactions/entities/transaction.entity.js';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';
import {
  amountSchema,
  calendarDaySchema,
  transactionOutputSchema,
} from './schemas.js';

/**
 * Replaces one of the caller's transactions via `PUT /transactions/:id`. The
 * REST contract treats PUT as a FULL replace of the mutable fields, so the
 * agent must supply the complete record (an omitted `description` clears it).
 * A non-owned id surfaces as the API's `404`. Token comes from the request
 * context (Layer 1).
 */
export function createUpdateTransactionTool(client: TransactionApiClient) {
  return createTool({
    id: 'update-transaction',
    description:
      "Replace one of the caller's own transactions by id. This is a full replace: provide ALL fields (amount, type, currency, date, and description) with their final values. An omitted description clears it.",
    inputSchema: z.object({
      id: z.string().uuid(),
      amount: amountSchema,
      type: z.enum(TransactionType),
      currency: z.enum(TransactionCurrency),
      date: calendarDaySchema,
      description: z.string().max(500).optional(),
    }),
    outputSchema: transactionOutputSchema,
    requestContextSchema,
    execute: async (inputData, context) => {
      const token = requireAccessToken(context);
      const updated = await client.update(
        inputData.id,
        {
          amount: inputData.amount,
          type: inputData.type,
          currency: inputData.currency,
          date: inputData.date,
          description: inputData.description ?? null,
        },
        token,
      );
      return {
        id: updated.id,
        amount: updated.amount,
        type: updated.type,
        currency: updated.currency,
        date: updated.date,
        description: updated.description,
      };
    },
  });
}
