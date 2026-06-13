import type { SamplingResult } from '../shared/mcp.types'
import { createPendingRegistry } from './pendingRequests'

// The pending-request bridge for server sampling/createMessage requests. See
// pendingRequests.ts for the mechanism; a cancelled sampling resolves to the
// "cancel" action, which the mcpClient handler turns into a JSON-RPC error.
export const { createPending, resolvePending, cancelPendingForCall } =
  createPendingRegistry<SamplingResult>({ action: 'cancel' })
