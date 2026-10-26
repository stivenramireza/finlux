import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TransactionApiClient } from './transaction-api.client.js';
import { FinluxMcpServer } from './finlux-mcp-server.js';

/**
 * Owns the in-process MCP boundary for transactions: the HTTP
 * `TransactionApiClient` (the only data path — no DB access) and the
 * `FinluxMcpServer` that registers the transaction tools. Exported so the
 * `AgentModule` can give the agent the registered tool set.
 *
 * Note: this module imports neither `TransactionsModule` nor TypeORM for
 * transactions — the agent reaches transactions solely over HTTP.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    TransactionApiClient,
    {
      provide: FinluxMcpServer,
      inject: [TransactionApiClient],
      useFactory: (client: TransactionApiClient) => new FinluxMcpServer(client),
    },
  ],
  exports: [FinluxMcpServer, TransactionApiClient],
})
export class McpModule {}
