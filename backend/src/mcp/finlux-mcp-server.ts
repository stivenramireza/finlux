import { MCPServer } from '@mastra/mcp';
import type { TransactionApiClient } from './transaction-api.client.js';
import { buildTransactionTools } from './tools/index.js';
import type { BuildToolsOptions, TransactionToolSet } from './tools/index.js';

/**
 * The in-process Finlux MCP server (design Decision 2a). It registers the
 * closed allowlist of transaction tools — whose handlers are HTTP clients of
 * the transaction REST API, never the database. Mounting the tools on an
 * `MCPServer` keeps the MCP registration/allowlist boundary authoritative
 * inside this single NestJS deployment.
 *
 * The same registered tool objects are exposed to the agent in-process (see
 * {@link FinluxMcpServer.toolSet}). We intentionally do NOT round-trip the
 * agent↔tool call through a stdio/HTTP MCP transport: `@mastra/mcp`'s
 * `MCPClient` only connects over stdio (a subprocess) or HTTP (a listening
 * URL), neither of which is an in-process in-memory transport. Spawning a
 * subprocess or opening a second HTTP listener would add moving parts and push
 * the caller JWT through a transport header for no behavioral gain — and would
 * weaken Layer 1 (the token must stay in the server-side RequestContext). The
 * tools, their request-context contract, the HTTP-client boundary, and
 * Layers 1 & 3 are all preserved; only the needless transport hop is omitted.
 */
export class FinluxMcpServer {
  readonly server: MCPServer;
  readonly toolSet: TransactionToolSet;

  constructor(client: TransactionApiClient, options: BuildToolsOptions = {}) {
    this.toolSet = buildTransactionTools(client, options);
    this.server = new MCPServer({
      id: 'finlux-transactions',
      name: 'Finlux Transactions',
      version: '0.0.1',
      tools: this.toolSet,
    });
  }
}
