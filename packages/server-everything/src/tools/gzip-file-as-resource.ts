import { z } from 'zod'
import { gzipSync } from 'node:zlib'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, Resource } from '@modelcontextprotocol/sdk/types.js'
import { getSessionResourceURI, registerSessionResource } from '../resources/session'

const GZIP_MAX_FETCH_SIZE = Number(process.env.GZIP_MAX_FETCH_SIZE ?? String(10 * 1024 * 1024))
const GZIP_MAX_FETCH_TIME_MILLIS = Number(process.env.GZIP_MAX_FETCH_TIME_MILLIS ?? String(30 * 1000))
const GZIP_ALLOWED_DOMAINS = (process.env.GZIP_ALLOWED_DOMAINS ?? '')
  .split(',')
  .map((d: string) => d.trim().toLowerCase())
  .filter((d: string) => d.length > 0)

export function registerGzipFileAsResource(server: McpServer): void {
  server.registerTool(
    'gzip-file-as-resource',
    {
      description:
        "Compresses a single file using gzip compression. Depending upon the selected output type, returns either the compressed data as a gzipped resource or a resource link, allowing it to be downloaded in a subsequent request during the current session. Demo/test fixture.",
      inputSchema: {
        name: z.string().describe('Name of the output file').default('README.md.gz'),
        data: z
          .url()
          .describe('URL or data URI of the file content to compress')
          .default(
            'https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/README.md'
          ),
        outputType: z
          .enum(['resourceLink', 'resource'])
          .default('resourceLink')
          .describe(
            "How the resulting gzipped file should be returned. 'resourceLink' returns a link to a resource that can be read later, 'resource' returns a full resource object."
          )
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ name, data: dataUri, outputType }): Promise<CallToolResult> => {
      const url = validateDataURI(dataUri)

      const response = await fetchSafely(url, {
        maxBytes: GZIP_MAX_FETCH_SIZE,
        timeoutMillis: GZIP_MAX_FETCH_TIME_MILLIS
      })

      const compressedBuffer = gzipSync(Buffer.from(response))

      const uri = getSessionResourceURI(name)
      const blob = compressedBuffer.toString('base64')
      const mimeType = 'application/gzip'
      const resource = { uri, name, mimeType } as Resource

      const resourceLink = registerSessionResource(server, resource, 'blob', blob)

      if (outputType === 'resource') {
        return { content: [{ type: 'resource', resource: { uri, mimeType, blob } }] }
      }
      return { content: [resourceLink] }
    }
  )
}

function validateDataURI(dataUri: string): URL {
  const url = new URL(dataUri)
  try {
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'data:') {
      throw new Error(
        `Unsupported URL protocol for ${dataUri}. Only http, https, and data URLs are supported.`
      )
    }
    if (GZIP_ALLOWED_DOMAINS.length > 0 && (url.protocol === 'http:' || url.protocol === 'https:')) {
      const domain = url.hostname
      const domainAllowed = GZIP_ALLOWED_DOMAINS.some(
        (allowedDomain) => domain === allowedDomain || domain.endsWith(`.${allowedDomain}`)
      )
      if (!domainAllowed) {
        throw new Error(`Domain ${domain} is not in the allowed domains list.`)
      }
    }
  } catch (error) {
    throw new Error(
      `Error processing file ${dataUri}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return url
}

async function fetchSafely(
  url: URL,
  { maxBytes, timeoutMillis }: { maxBytes: number; timeoutMillis: number }
): Promise<ArrayBuffer> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(`Fetching ${url} took more than ${timeoutMillis} ms and was aborted.`),
    timeoutMillis
  )

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.body) {
      throw new Error('No response body')
    }

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader != null) {
      const contentLength = parseInt(contentLengthHeader, 10)
      if (contentLength > maxBytes) {
        throw new Error(`Content-Length for ${url} exceeds max of ${maxBytes}: ${contentLength}`)
      }
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalSize = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        totalSize += value.length

        if (totalSize > maxBytes) {
          reader.cancel()
          throw new Error(`Response from ${url} exceeds ${maxBytes} bytes`)
        }

        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }

    const buffer = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    return buffer.buffer
  } finally {
    clearTimeout(timeout)
  }
}
