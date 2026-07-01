import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerEcho } from './echo'
import { registerAdd } from './add'
import { registerPrintEnv } from './print-env'
import { registerGetTinyImage } from './get-tiny-image'
import { registerAnnotatedMessage } from './annotated-message'
import { registerGetResourceReference } from './get-resource-reference'
import { registerGetStructuredContent } from './get-structured-content'
import { registerGetResourceLinks } from './get-resource-links'
import { registerGzipFileAsResource } from './gzip-file-as-resource'
import { registerToggleSimulatedLogging } from './toggle-simulated-logging'
import { registerToggleSubscriberUpdates } from './toggle-subscriber-updates'
import { registerTriggerLongRunningOperation } from './trigger-long-running-operation'
import { registerSimulateResearchQuery } from './simulate-research-query'
import { registerTriggerElicitationRequestAsync } from './trigger-elicitation-request-async'
import { registerTriggerElicitationRequest } from './trigger-elicitation-request'
import { registerTriggerSamplingRequestAsync } from './trigger-sampling-request-async'
import { registerTriggerSamplingRequest } from './trigger-sampling-request'
import { registerTriggerUrlElicitation } from './trigger-url-elicitation'
import { registerGetRootsList } from './get-roots-list'

// Tools with no capability dependency — safe to register immediately at
// server construction, before any client has connected.
const registerFns: Array<(server: McpServer) => void> = [
  registerEcho,
  registerAdd,
  registerPrintEnv,
  registerGetTinyImage,
  registerAnnotatedMessage,
  registerGetResourceReference,
  registerGetStructuredContent,
  registerGetResourceLinks,
  registerGzipFileAsResource,
  registerToggleSimulatedLogging,
  registerToggleSubscriberUpdates,
  registerTriggerLongRunningOperation
]

export function registerTools(server: McpServer): void {
  for (const register of registerFns) {
    register(server)
  }
}

// Tools that depend on a client-declared capability. Registered only from
// server.server.oninitialized (see index.ts), once the client's actual
// capabilities are known — registering these eagerly at construction time
// would mean getClientCapabilities() always reads empty, and either the
// tool never registers or a flag computed from it is permanently stale.
const registerConditionalFns: Array<(server: McpServer) => void> = [
  registerGetRootsList,
  registerTriggerElicitationRequest,
  registerTriggerUrlElicitation,
  registerTriggerSamplingRequest,
  registerSimulateResearchQuery,
  registerTriggerSamplingRequestAsync,
  registerTriggerElicitationRequestAsync
]

export function registerConditionalTools(server: McpServer): void {
  for (const register of registerConditionalFns) {
    register(server)
  }
}
