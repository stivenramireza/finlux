import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';
import { transactionOutputSchema } from './schemas.js';

/**
 * Fetches one of the caller's transactions by id via the transaction HTTP API.
 * A non-owned or missing id surfaces as the API's `404` (a clean "not found"),
 * never disclosing another user's data. Token comes from the request context.
 */
export function createGetTransactionTool(client: TransactionApiClient) {
  return createTool({
    id: 'get-transaction',
    description: "Get one of the caller's own transactions by its id.",
    inputSchema: z.object({ id: z.string().uuid() }),
    outputSchema: transactionOutputSchema,
    requestContextSchema,
    execute: async (inputData, context) => {
      const token = requireAccessToken(context);
      const tx = await client.getOne(inputData.id, token);
      return {
        id: tx.id,
        amount: tx.amount,
        type: tx.type,
        currency: tx.currency,
        date: tx.date,
        description: tx.description,
      };
    },
  });
}
