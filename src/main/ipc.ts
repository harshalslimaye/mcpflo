import { ipcMain, BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { getServers, getServerById, addServer, updateServer, removeServer } from './store'
import {
  fetchCapabilities,
  disconnectServer,
  callTool,
  readResource,
  getPrompt,
  authorizeServer,
  onAuthEvent
} from './mcpClient'
import { clearOAuthTokens, hasValidOAuthTokens, readAuthDetails } from './oauthStore'
import { isSecretStorageAvailable } from './secrets'
import { assertValidServerId } from './serverId'
import {
  createPending as createPendingElicitation,
  resolvePending as resolvePendingElicitation,
  cancelPendingForCall as cancelPendingElicitations
} from './elicitations'
import {
  createPending as createPendingSampling,
  resolvePending as resolvePendingSampling,
  cancelPendingForCall as cancelPendingSamplings
} from './samplings'
import {
  readAllCapabilities,
  writeCapabilities,
  clearCapabilities,
  removeServerDir
} from './capabilitiesCache'
import { createScriptStore } from './testing/scriptStore'
import { resolveTestsRoot } from './testing/testsRoot'
import { runTests } from './testing/engine'
import type {
  ServerConfig,
  TaskSupport,
  ElicitationResult,
  SamplingResult,
  AuthEvent,
  ToolCallResult,
  GetPromptResult,
  ResourceReadResult
} from '../shared/mcp.types'
import type { TestKind, TestRunSummary } from '../shared/testing.types'

export function registerIpcHandlers(): void {
  // In-flight capability fetches, keyed by server id, so a later
  // mcp:cancelCapabilities can abort the connect/listing that's still running.
  // One entry per server: a fetch replaces any prior controller for that id.
  const fetchAborters = new Map<string, AbortController>()

  // Fan OAuth flow events out to every live renderer (single-window today, but
  // resilient to multi-window), guarded against destroyed senders — the same
  // lifecycle guard the callTool side channels use.
  const broadcastAuthEvent = (payload: AuthEvent): void => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.webContents.isDestroyed()) {
        win.webContents.send('mcp:authEvent', payload)
      }
    }
  }
  onAuthEvent(broadcastAuthEvent)

  ipcMain.handle('mcp:getServers', () => getServers())

  ipcMain.handle('mcp:addServer', (_event, config: ServerConfig) => addServer(config))

  ipcMain.handle(
    'mcp:updateServer',
    (_event, id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => {
      assertValidServerId(id)
      return updateServer(id, patch)
    }
  )

  ipcMain.handle('mcp:removeServer', async (_event, id: string) => {
    assertValidServerId(id)
    await disconnectServer(id)
    removeServer(id)
    await removeServerDir(id)
  })

  // Capabilities cache
  ipcMain.handle('mcp:getCachedCapabilities', () => readAllCapabilities())

  // Ids of OAuth servers that currently hold valid (unexpired) tokens — lets
  // hydrate restore the "signed in" status across a restart (otherwise reset to
  // idle) without showing green for a token that's already dead. Only the ids
  // cross the boundary; the tokens stay in main.
  ipcMain.handle('mcp:getAuthedServerIds', async () => {
    const oauth = getServers().filter(
      (s) => s.transport.type === 'streamable-http' && s.transport.auth === 'oauth'
    )
    const flags = await Promise.all(oauth.map((s) => hasValidOAuthTokens(s.id)))
    return oauth.filter((_, i) => flags[i]).map((s) => s.id)
  })

  // Redacted OAuth session summary for the auth details panel — derived facts
  // only (client id, scopes, expiry); the tokens themselves never leave main.
  // Null for non-OAuth servers or when no tokens are held.
  ipcMain.handle('mcp:getAuthDetails', (_event, id: string) => {
    assertValidServerId(id)
    const config = getServerById(id)
    const t = config.transport
    if (t.type !== 'streamable-http' || t.auth !== 'oauth') return null
    return readAuthDetails(id, t.oauth?.clientId, t.oauth?.clientSecret !== undefined)
  })

  ipcMain.handle('mcp:fetchCapabilities', async (_event, id: string) => {
    assertValidServerId(id)
    const config = getServerById(id)
    // Abort any prior in-flight fetch for this id before starting a new one, then
    // register this fetch's controller so mcp:cancelCapabilities can reach it.
    fetchAborters.get(id)?.abort()
    const aborter = new AbortController()
    fetchAborters.set(id, aborter)
    try {
      const result = await fetchCapabilities(config, aborter.signal)
      // Don't cache the empty placeholder returned when sign-in is needed — the
      // real listing is written once auth completes and capabilities are fetched.
      if (!result.authRequired) await writeCapabilities(config.id, result)
      return result
    } finally {
      // Only clear our own entry — a newer fetch may have replaced it.
      if (fetchAborters.get(id) === aborter) fetchAborters.delete(id)
    }
  })

  // Cancel an in-flight capability fetch (the renderer's Cancel button). Aborting
  // rejects the connect/listing; the SDK closes the partial client and the
  // OAuth loopback is torn down, so no process or listener is left dangling.
  ipcMain.handle('mcp:cancelCapabilities', (_event, id: string) => {
    assertValidServerId(id)
    fetchAborters.get(id)?.abort(new Error('Capability fetch cancelled'))
  })

  ipcMain.handle('mcp:clearCapabilities', (_event, id: string) => {
    assertValidServerId(id)
    return clearCapabilities(id)
  })

  ipcMain.handle('mcp:disconnectServer', (_event, id: string) => {
    assertValidServerId(id)
    return disconnectServer(id)
  })

  // Whether OS-level encryption is available — gates OAuth mode in the UI, since
  // OAuth tokens must be encryptable at rest (no in-memory fallback).
  ipcMain.handle('mcp:isEncryptionAvailable', () => isSecretStorageAvailable())

  // OAuth: kick off (or re-run) the authorization flow. Progress is reported
  // out-of-band over `mcp:authEvent`, so this resolves once the flow settles.
  ipcMain.handle('mcp:authorizeServer', (_event, id: string) => {
    assertValidServerId(id)
    return authorizeServer(getServerById(id))
  })

  // Sign out: tear down the live session first, drop the tokens (preserving
  // client_information so re-auth doesn't re-register), clear the cached
  // capabilities (so the row doesn't resurrect green on the next hydrate), then
  // reset the renderer's auth field to idle.
  ipcMain.handle('mcp:clearAuth', async (_event, id: string) => {
    assertValidServerId(id)
    await disconnectServer(id)
    await clearOAuthTokens(id)
    await clearCapabilities(id)
    broadcastAuthEvent({ type: 'idle', serverId: id })
  })

  // Tool execution. Notifications arriving mid-call are pushed to the calling
  // window over `mcp:toolNotification`, tagged with the renderer-chosen callId.
  // Elicitation requests are pushed over `mcp:elicitationRequest` and held open
  // until the renderer answers via `mcp:respondToElicitation` (or a cleanup
  // path settles them as cancel).
  ipcMain.handle(
    'mcp:callTool',
    async (
      event,
      id: string,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string,
      taskSupport?: TaskSupport
    ) => {
      assertValidServerId(id)
      const config = getServerById(id)
      const outcome = await callTool(
        config,
        toolName,
        args,
        (notification) => {
          if (callId !== undefined && !event.sender.isDestroyed()) {
            event.sender.send('mcp:toolNotification', { callId, notification })
          }
        },
        async (params, signal) => {
          if (callId === undefined || event.sender.isDestroyed()) {
            return { action: 'cancel' as const }
          }
          const { requestId: elicitationId, promise } = createPendingElicitation(callId)
          // Server cancelled its request (e.g. its elicitation timeout fired).
          const onAbort = (): void => {
            if (
              resolvePendingElicitation(elicitationId, { action: 'cancel' }) &&
              !event.sender.isDestroyed()
            ) {
              event.sender.send('mcp:elicitationClosed', { elicitationId })
            }
          }
          signal.addEventListener('abort', onAbort, { once: true })
          const onDestroyed = (): void => {
            resolvePendingElicitation(elicitationId, { action: 'cancel' })
          }
          event.sender.once('destroyed', onDestroyed)
          event.sender.send('mcp:elicitationRequest', {
            callId,
            elicitationId,
            serverName: config.name,
            toolName,
            params
          })
          try {
            return await promise
          } finally {
            signal.removeEventListener('abort', onAbort)
            if (!event.sender.isDestroyed()) {
              event.sender.removeListener('destroyed', onDestroyed)
            }
          }
        },
        async (params, signal) => {
          if (callId === undefined || event.sender.isDestroyed()) {
            return { action: 'cancel' as const }
          }
          const { requestId: samplingId, promise } = createPendingSampling(callId)
          // Server cancelled its request (e.g. its own timeout fired).
          const onAbort = (): void => {
            if (
              resolvePendingSampling(samplingId, { action: 'cancel' }) &&
              !event.sender.isDestroyed()
            ) {
              event.sender.send('mcp:samplingClosed', { samplingId })
            }
          }
          signal.addEventListener('abort', onAbort, { once: true })
          const onDestroyed = (): void => {
            resolvePendingSampling(samplingId, { action: 'cancel' })
          }
          event.sender.once('destroyed', onDestroyed)
          event.sender.send('mcp:samplingRequest', {
            callId,
            samplingId,
            serverName: config.name,
            toolName,
            params
          })
          try {
            return await promise
          } finally {
            signal.removeEventListener('abort', onAbort)
            if (!event.sender.isDestroyed()) {
              event.sender.removeListener('destroyed', onDestroyed)
            }
          }
        },
        taskSupport
      )
      // The call has settled (result, error, or transport death) — any
      // elicitation or sampling still pending can never be answered.
      if (callId !== undefined) {
        for (const elicitationId of cancelPendingElicitations(callId)) {
          if (!event.sender.isDestroyed()) {
            event.sender.send('mcp:elicitationClosed', { elicitationId })
          }
        }
        for (const samplingId of cancelPendingSamplings(callId)) {
          if (!event.sender.isDestroyed()) {
            event.sender.send('mcp:samplingClosed', { samplingId })
          }
        }
      }
      return outcome
    }
  )

  // Resource read. A single request → response with no mid-call side channels,
  // so unlike mcp:callTool there's no callId / notification plumbing.
  ipcMain.handle('mcp:readResource', (_event, id: string, uri: string) => {
    assertValidServerId(id)
    return readResource(getServerById(id), uri)
  })

  // Prompt get. Like resource read, a single request → response with no side
  // channels — but it carries arguments (prompts take named string inputs).
  ipcMain.handle(
    'mcp:getPrompt',
    (_event, id: string, name: string, args: Record<string, string>) => {
      assertValidServerId(id)
      return getPrompt(getServerById(id), name, args)
    }
  )

  ipcMain.handle(
    'mcp:respondToElicitation',
    (_event, elicitationId: string, result: ElicitationResult) => {
      resolvePendingElicitation(elicitationId, result)
    }
  )

  ipcMain.handle('mcp:respondToSampling', (_event, samplingId: string, result: SamplingResult) => {
    resolvePendingSampling(samplingId, result)
  })

  // Testing (Bruno-style test() + expect() scripts). A separate `testing:`
  // namespace, deliberately apart from `mcp:` — it's a local file-store +
  // sandbox concern, not an MCP protocol operation. Each handler resolves the
  // server's tests root fresh (resolveTestsRoot), so a future custom-folder
  // override only has to change that one function.
  ipcMain.handle(
    'testing:getScript',
    (_event, id: string, kind: TestKind, name: string): Promise<string | null> => {
      assertValidServerId(id)
      return createScriptStore(resolveTestsRoot(id)).readScript(kind, name)
    }
  )

  ipcMain.handle(
    'testing:saveScript',
    (_event, id: string, kind: TestKind, name: string, content: string): Promise<void> => {
      assertValidServerId(id)
      return createScriptStore(resolveTestsRoot(id)).writeScript(kind, name, content)
    }
  )

  ipcMain.handle(
    'testing:saveInputs',
    (
      _event,
      id: string,
      kind: TestKind,
      name: string,
      inputs: Record<string, unknown>
    ): Promise<void> => {
      assertValidServerId(id)
      return createScriptStore(resolveTestsRoot(id)).writeInputs(kind, name, inputs)
    }
  )

  // Runs a test script against an already-unwrapped call result (the renderer
  // extracts the result from the JSON-RPC envelope before calling this — see
  // ToolCallOutcome/PromptGetOutcome/ResourceReadOutcome). No server id or
  // script-store lookup involved: the renderer already holds the script text
  // it's editing/autosaving, so this is a pure pass-through to the engine.
  ipcMain.handle(
    'testing:run',
    (
      _event,
      input: {
        script: string
        kind?: TestKind
        result: ToolCallResult | GetPromptResult | ResourceReadResult
        callDurationMs?: number
      }
    ): Promise<TestRunSummary> => runTests(input)
  )

  // Custom tests folder (Step 2b). Picking is a pure "ask the OS for a
  // folder" operation — persisting the choice reuses the existing
  // mcp:updateServer channel (renderer calls it with { testsPath: folder }
  // after this resolves), so there's no separate "set" handler here. Clearing
  // needs no handler at all: the renderer calls mcp:updateServer with
  // { testsPath: undefined } directly.
  ipcMain.handle('testing:chooseTestsFolder', async (event, id: string): Promise<string | null> => {
    assertValidServerId(id)
    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const folder = result.filePaths[0]
    await seedGitignore(folder)
    return folder
  })

  // Read-only: whether the server's configured tests folder (custom or
  // default) currently exists on disk, so the UI can warn instead of letting
  // a write silently recreate a folder the user deleted intentionally.
  ipcMain.handle(
    'testing:getTestsFolderStatus',
    async (_event, id: string): Promise<{ path: string; isCustom: boolean; exists: boolean }> => {
      assertValidServerId(id)
      const server = getServerById(id)
      const path = resolveTestsRoot(id)
      const exists = server.testsPath
        ? await fs
            .stat(path)
            .then(() => true)
            .catch(() => false)
        : true
      return { path, isCustom: server.testsPath !== undefined, exists }
    }
  )
}

// Seeds a `.gitignore` excluding machine-managed `.inputs.json` files, once,
// the first time a folder is chosen as a custom tests root — a custom folder
// is meant to be a real, git-tracked project directory, unlike the default
// userData location.
async function seedGitignore(folder: string): Promise<void> {
  const gitignorePath = join(folder, '.gitignore')
  try {
    await fs.access(gitignorePath)
  } catch {
    await fs.writeFile(gitignorePath, '*.inputs.json\n', 'utf-8')
  }
}
