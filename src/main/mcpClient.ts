import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  ServerConfig,
  Tool,
  Resource,
  Prompt,
  ResourceReadOutcome,
  PromptGetOutcome
} from '../shared/mcp.types'
import {
  getSession,
  handleOperationAuthError,
  disconnectServer,
  disconnectAll
} from './mcp/session'
import { callTool } from './mcp/toolCalls'
import { onAuthEvent, DcrRegistrationRequiredError } from './mcp/oauthHandshake'
import type { ElicitationHandler, SamplingHandler } from './mcp/types'

export type { ElicitationHandler, SamplingHandler }
export { onAuthEvent, callTool, disconnectServer, disconnectAll }

export interface ConnectResult {
  tools: Tool[]
  resources: Resource[]
  prompts: Prompt[]
  // Set (with empty listings) when the connect couldn't proceed because the
  // server needs (re-)authorization — see the shared ConnectResult for details.
  authRequired?: boolean
}

export async function connectServer(
  config: ServerConfig,
  signal?: AbortSignal
): Promise<ConnectResult> {
  const { client } = await getSession(config, signal)

  // Forward the abort signal into each listing too, so a cancel during the
  // capability fetch (not just the connect) interrupts the in-flight requests.
  const opts = { signal }
  const [toolsResult, resourcesResult, promptsResult] = await Promise.all([
    client.listTools(undefined, opts).catch(() => ({ tools: [] })),
    client.listResources(undefined, opts).catch(() => ({ resources: [] })),
    client.listPrompts(undefined, opts).catch(() => ({ prompts: [] }))
  ])

  return {
    tools: toolsResult.tools as Tool[],
    resources: resourcesResult.resources as Resource[],
    prompts: promptsResult.prompts as Prompt[]
  }
}

// Triggers (or re-triggers) the OAuth flow by establishing the server's session.
// Re-auth relies on the stale session having been dropped first (clearAuth and
// the operation-path auth handler both do this), so concurrency stays bounded by
// the sessions map: getSession shares one in-flight connect per server.
export async function authorizeServer(config: ServerConfig): Promise<void> {
  try {
    await getSession(config)
  } catch (err) {
    // A DCR failure already emitted dcr_required, which opens the recovery modal —
    // that's the handled outcome, not a flow error. Swallow it so the IPC handler
    // doesn't log a raw rejection and the renderer doesn't show a redundant toast
    // on top of the modal. Every other failure path emits its own auth 'error'
    // event and is re-thrown for the renderer's safety-net catch.
    if (err instanceof DcrRegistrationRequiredError) return
    throw err
  }
}

// Reads a resource's contents over the server's warm, pooled connection. Unlike
// a tool call this needs none of the per-call machinery (no `active` slot, no
// transport tap, no serialization): resources/read is a single request →
// response with no progress/elicitation/sampling side channels. It can run
// concurrently with an in-flight tool call — the read's response carries its own
// id, so the tool call's tap never mistakes it for that call's output. The SDK
// returns only the inner result, so we wrap it in a JSON-RPC envelope to match
// the shape the renderer parses for tool calls (giving it a Raw view for free).
export async function readResource(
  config: ServerConfig,
  uri: string
): Promise<ResourceReadOutcome> {
  let session: Awaited<ReturnType<typeof getSession>>
  try {
    session = await getSession(config)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { authRequired: true }
    // A pre-response failure (spawn/connection error, unsupported transport)
    // never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const result = await session.client.readResource({ uri })
    return { response: { jsonrpc: '2.0', result } }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { authRequired: true }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Gets a prompt's rendered messages over the server's warm, pooled connection.
// Like readResource this needs none of the per-call machinery: prompts/get is a
// single request → response with no progress/elicitation/sampling side channels,
// and its response carries its own id so it can run alongside an in-flight tool
// call. The SDK returns only the inner result, so we wrap it in a JSON-RPC
// envelope to match the shape the renderer parses for tool calls.
export async function getPrompt(
  config: ServerConfig,
  name: string,
  args: Record<string, string>
): Promise<PromptGetOutcome> {
  let session: Awaited<ReturnType<typeof getSession>>
  try {
    session = await getSession(config)
  } catch (err) {
    if (err instanceof UnauthorizedError) return { authRequired: true }
    // A pre-response failure (spawn/connection error, unsupported transport)
    // never produced a JSON-RPC envelope.
    return { error: err instanceof Error ? err.message : String(err) }
  }

  try {
    const result = await session.client.getPrompt({ name, arguments: args })
    return { response: { jsonrpc: '2.0', result } }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { authRequired: true }
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Fetches a snapshot of a server's capabilities, warming the connection so the
// first tool call on it is instant.
export async function fetchCapabilities(
  config: ServerConfig,
  signal?: AbortSignal
): Promise<ConnectResult> {
  try {
    return await connectServer(config, signal)
  } catch (err) {
    // Auth-required conditions aren't capability failures — the auth event has
    // already fired (UnauthorizedError below also drops the dead session; the DCR
    // path emitted dcr_required, which opens the recovery modal). Surface them as a
    // benign authRequired outcome so the renderer shows the sign-in affordance
    // instead of a red error, and the IPC handler doesn't log a raw rejection.
    if (err instanceof UnauthorizedError) {
      handleOperationAuthError(config.id)
      return { tools: [], resources: [], prompts: [], authRequired: true }
    }
    if (err instanceof DcrRegistrationRequiredError) {
      return { tools: [], resources: [], prompts: [], authRequired: true }
    }
    throw err
  }
}
