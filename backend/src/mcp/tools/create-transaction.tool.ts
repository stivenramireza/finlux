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
 * Creates a transaction for the caller via `POST /transactions`. This is the
 * ONLY write path for natural-language capture; the system prompt gates it
 * behind explicit user confirmation (the tool itself performs no confirmation
 * logic). Any suggested category is folded into `description` (there is no
 * category column). Token comes from the request context (Layer 1).
 */
export function createCreateTransactionTool(client: TransactionApiClient) {
  return createTool({
    id: 'create-transaction',
    description:
      'Create (save) a transaction for the caller. Only call this AFTER the user has explicitly confirmed the draft. Fold any category label into the description.',
    inputSchema: z.object({
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
      const created = await client.create(
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
        id: created.id,
        amount: created.amount,
        type: created.type,
        currency: created.currency,
        date: created.date,
        description: created.description,
      };
    },
  });
}
