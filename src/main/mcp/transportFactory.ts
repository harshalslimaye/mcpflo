import {
  StdioClientTransport,
  getDefaultEnvironment
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { ServerConfig } from '../../shared/mcp.types'
import { resolveShellPath } from '../shellPath'
import { credentialOverHttp } from '../../shared/transportSafety'

// Builds the SDK transport for a server's configured transport type. Only this
// construction is transport-specific — everything downstream (client, taps,
// handlers) works against the generic Transport interface.
export function createTransport(config: ServerConfig): Transport {
  const t = config.transport
  switch (t.type) {
    case 'stdio': {
      // Inherit only a safe baseline (PATH, HOME, …) rather than the full host
      // environment, so secrets in process.env never leak into spawned servers.
      // Override PATH with the login-shell value so binaries like npx resolve,
      // then layer the user's explicitly configured env vars on top (so a
      // user-set PATH still wins).
      const env: Record<string, string> = { ...getDefaultEnvironment() }
      const shellPath = resolveShellPath()
      if (shellPath) env.PATH = shellPath
      return new StdioClientTransport({
        command: t.command,
        args: t.args,
        env: { ...env, ...t.env }
      })
    }
    case 'streamable-http': {
      // requestInit.headers applies to every request (POST + the fetch-based GET
      // stream), so an Authorization header covers token-authed servers.
      const url = new URL(t.url)
      // Enforce the cleartext-credential guardrail here, not only in the UI, so a
      // config that bypassed the form (hand-edited config.json, a future import)
      // can't leak a credential header over plain http to a non-loopback host.
      assertCredentialSafe(url, t.headers)
      return new StreamableHTTPClientTransport(
        url,
        t.headers ? { requestInit: { headers: t.headers } } : undefined
      )
    }
  }
}

// Refuses to build a transport that would send a credential header in cleartext
// over non-loopback http. Throws (failing the connect) rather than silently
// stripping the header — a misconfigured-but-secret-bearing server should surface
// loudly, not connect unauthenticated.
export function assertCredentialSafe(url: URL, headers?: Record<string, string>): void {
  if (!headers) return
  const unsafe = credentialOverHttp(url, Object.keys(headers))
  if (unsafe) throw new Error(unsafe)
}
