import { ipcMain, BrowserWindow } from 'electron'
import { getServers, addServer, updateServer, removeServer } from './store'
import {
  fetchCapabilities,
  disconnectServer,
  callTool,
  readResource,
  getPrompt,
  authorizeServer,
  onAuthEvent
} from './mcpClient'
import { clearOAuthTokens } from './oauthStore'
import { isSecretStorageAvailable } from './secrets'
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
import type {
  ServerConfig,
  TaskSupport,
  ElicitationResult,
  SamplingResult,
  AuthEvent
} from '../shared/mcp.types'

export function registerIpcHandlers(): void {
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
    (_event, id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => updateServer(id, patch)
  )

  ipcMain.handle('mcp:removeServer', async (_event, id: string) => {
    await disconnectServer(id)
    removeServer(id)
    await removeServerDir(id)
  })

  // Capabilities cache
  ipcMain.handle('mcp:getCachedCapabilities', () => readAllCapabilities())

  ipcMain.handle('mcp:fetchCapabilities', async (_event, config: ServerConfig) => {
    const result = await fetchCapabilities(config)
    // Don't cache the empty placeholder returned when sign-in is needed — the
    // real listing is written once auth completes and capabilities are fetched.
    if (!result.authRequired) await writeCapabilities(config.id, result)
    return result
  })

  ipcMain.handle('mcp:clearCapabilities', (_event, id: string) => clearCapabilities(id))

  ipcMain.handle('mcp:disconnectServer', (_event, id: string) => disconnectServer(id))

  // Whether OS-level encryption is available — gates OAuth mode in the UI, since
  // OAuth tokens must be encryptable at rest (no in-memory fallback).
  ipcMain.handle('mcp:isEncryptionAvailable', () => isSecretStorageAvailable())

  // OAuth: kick off (or re-run) the authorization flow. Progress is reported
  // out-of-band over `mcp:authEvent`, so this resolves once the flow settles.
  ipcMain.handle('mcp:authorizeServer', (_event, config: ServerConfig) => authorizeServer(config))

  // Sign out: tear down the live session first, then drop the tokens (preserving
  // client_information so re-auth doesn't re-register), then reset the renderer's
  // auth field to idle.
  ipcMain.handle('mcp:clearAuth', async (_event, id: string) => {
    await disconnectServer(id)
    await clearOAuthTokens(id)
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
      config: ServerConfig,
      toolName: string,
      args: Record<string, unknown>,
      callId?: string,
      taskSupport?: TaskSupport
    ) => {
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
  ipcMain.handle('mcp:readResource', (_event, config: ServerConfig, uri: string) =>
    readResource(config, uri)
  )

  // Prompt get. Like resource read, a single request → response with no side
  // channels — but it carries arguments (prompts take named string inputs).
  ipcMain.handle(
    'mcp:getPrompt',
    (_event, config: ServerConfig, name: string, args: Record<string, string>) =>
      getPrompt(config, name, args)
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
}
