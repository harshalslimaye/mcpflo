import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/index.js'
import { registerTools, registerConditionalTools } from './tools/index'
import { initSessionResources } from './resources/session'
import { registerLoggingCapability } from './server/logging'
import { registerSubscriptionsCapability } from './resources/subscriptions'
import { registerResources, readInstructions } from './resources/index'
import { registerPrompts } from './prompts/index'

// Builds a fully-configured server, not yet connected to any transport.
// Shared by index.ts (stdio, real usage) and the test harness (in-memory).
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: '@mcpflo/server-everything',
      version: '0.0.1'
    },
    {
      taskStore: new InMemoryTaskStore(),
      instructions: readInstructions(),
      // Unlike tools/resources, task-creation support isn't auto-declared by
      // registering a task tool — it must be advertised explicitly here. Same
      // for resources.subscribe: registering a resource never implies it.
      capabilities: {
        tasks: { requests: { tools: { call: {} } } },
        logging: {},
        resources: { subscribe: true }
      }
    }
  )

  registerTools(server)
  initSessionResources(server)
  registerLoggingCapability(server)
  registerSubscriptionsCapability(server)
  registerResources(server)
  registerPrompts(server)

  // Capability-gated tools are registered here, once the client's initialize
  // handshake has completed and its declared capabilities are actually known.
  server.server.oninitialized = () => {
    registerConditionalTools(server)
  }

  return server
}
