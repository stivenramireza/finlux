import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { TransactionApiClient } from '../transaction-api.client.js';
import { requestContextSchema } from './request-context.js';
import { requireAccessToken } from './context-token.js';

/**
 * Permanently deletes one of the caller's transactions via
 * `DELETE /transactions/:id`. Scoped by the caller's JWT; a non-owned or
 * missing id surfaces as the API's `404` and nothing is deleted. Token comes
 * from the request context (Layer 1).
 */
export function createDeleteTransactionTool(client: TransactionApiClient) {
  return createTool({
    id: 'delete-transaction',
    description:
      "Permanently delete one of the caller's own transactions by id.",
    inputSchema: z.object({ id: z.string().uuid() }),
    outputSchema: z.object({ id: z.string(), deleted: z.boolean() }),
    requestContextSchema,
    execute: async (inputData, context) => {
      const token = requireAccessToken(context);
      await client.remove(inputData.id, token);
      return { id: inputData.id, deleted: true };
    },
  });
}
