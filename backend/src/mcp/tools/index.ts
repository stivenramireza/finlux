import type { TransactionApiClient } from '../transaction-api.client.js';
import { createListTransactionsTool } from './list-transactions.tool.js';
import { createGetTransactionTool } from './get-transaction.tool.js';
import { createCreateTransactionTool } from './create-transaction.tool.js';
import { createUpdateTransactionTool } from './update-transaction.tool.js';
import { createDeleteTransactionTool } from './delete-transaction.tool.js';
import { createSummarizeTransactionsTool } from './summarize-transactions.tool.js';

/**
 * Builds the closed allowlist of transaction tools, all bound to the HTTP
 * `TransactionApiClient` (never the DB). Keyed by tool id for Mastra's `tools`
 * option and the MCP server registration. There is deliberately NO
 * money-movement tool.
 */
export function buildTransactionTools(client: TransactionApiClient) {
  return {
    'list-transactions': createListTransactionsTool(client),
    'get-transaction': createGetTransactionTool(client),
    'create-transaction': createCreateTransactionTool(client),
    'update-transaction': createUpdateTransactionTool(client),
    'delete-transaction': createDeleteTransactionTool(client),
    'summarize-transactions': createSummarizeTransactionsTool(client),
  };
}

export type TransactionToolSet = ReturnType<typeof buildTransactionTools>;
