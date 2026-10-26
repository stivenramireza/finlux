import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { McpModule } from '../mcp/mcp.module.js';
import { AgentService } from './agent.service.js';
import { AGENT_RUNNER } from './agent-runner.js';

/**
 * Wires the conversational agent. Imports `McpModule` for the in-process MCP
 * server + HTTP transaction tools (the only data path — no direct DB access)
 * and `ConfigModule` for the Google API key / model config. Exposes the agent
 * behind the {@link AGENT_RUNNER} port so the chat layer (and tests) depend on
 * the port, not on Mastra directly.
 */
@Module({
  imports: [ConfigModule, McpModule],
  providers: [
    AgentService,
    { provide: AGENT_RUNNER, useExisting: AgentService },
  ],
  exports: [AGENT_RUNNER],
})
export class AgentModule {}
