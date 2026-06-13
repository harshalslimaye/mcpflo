import { ipcMain } from 'electron'
import { getServers, addServer, updateServer, removeServer } from './store'
import { fetchCapabilities, callTool } from './mcpClient'
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
import type { ServerConfig, ElicitationResult, SamplingResult } from '../shared/mcp.types'

export function registerIpcHandlers(): void {
  ipcMain.handle('mcp:getServers', () => getServers())

  ipcMain.handle('mcp:addServer', (_event, config: ServerConfig) => addServer(config))

  ipcMain.handle(
    'mcp:updateServer',
    (_event, id: string, patch: Partial<Omit<ServerConfig, 'id'>>) => updateServer(id, patch)
  )

  ipcMain.handle('mcp:removeServer', async (_event, id: string) => {
    removeServer(id)
    await removeServerDir(id)
  })

  // Capabilities cache
  ipcMain.handle('mcp:getCachedCapabilities', () => readAllCapabilities())

  ipcMain.handle('mcp:fetchCapabilities', async (_event, config: ServerConfig) => {
    const result = await fetchCapabilities(config)
    await writeCapabilities(config.id, result)
    return result
  })

  ipcMain.handle('mcp:clearCapabilities', (_event, id: string) => clearCapabilities(id))

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
      callId?: string
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
        }
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
