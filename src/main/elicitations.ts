import type { ElicitationResult } from '../shared/mcp.types'
import { createPendingRegistry } from './pendingRequests'

// The pending-request bridge for server elicitation/create requests. See
// pendingRequests.ts for the mechanism; a cancelled elicitation resolves to the
// spec's "cancel" action.
export const { createPending, resolvePending, cancelPendingForCall } =
  createPendingRegistry<ElicitationResult>({ action: 'cancel' })
