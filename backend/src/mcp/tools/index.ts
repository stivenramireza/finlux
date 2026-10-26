import type { TransactionApiClient } from '../transaction-api.client.js';
import { createListTransactionsTool } from './list-transactions.tool.js';
import { createGetTransactionTool } from './get-transaction.tool.js';
import { createCreateTransactionTool } from './create-transaction.tool.js';
import { createUpdateTransactionTool } from './update-transaction.tool.js';
import { createDeleteTransactionTool } from './delete-transaction.tool.js';
import { createSummarizeTransactionsTool } from './summarize-transactions.tool.js';
import { createGetCurrentDateTool } from './get-current-date.tool.js';

/** Options for building the agent's tool allowlist. */
export interface BuildToolsOptions {
  /** IANA time zone used by `get-current-date` (e.g. `America/Bogota`). */
  timeZone?: string;
}

/**
 * Builds the closed allowlist of agent tools. The transaction tools are bound
 * to the HTTP `TransactionApiClient` (never the DB); `get-current-date` is a
 * pure, non-user-scoped helper so the agent can resolve relative dates. Keyed
 * by tool id for Mastra's `tools` option and the MCP server registration.
 * There is deliberately NO money-movement tool.
 */
export function buildTransactionTools(
  client: TransactionApiClient,
  options: BuildToolsOptions = {},
) {
  return {
    'list-transactions': createListTransactionsTool(client),
    'get-transaction': createGetTransactionTool(client),
    'create-transaction': createCreateTransactionTool(client),
    'update-transaction': createUpdateTransactionTool(client),
    'delete-transaction': createDeleteTransactionTool(client),
    'summarize-transactions': createSummarizeTransactionsTool(client),
    'get-current-date': createGetCurrentDateTool(options.timeZone),
  };
}

export type TransactionToolSet = ReturnType<typeof buildTransactionTools>;
