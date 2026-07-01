import { z } from 'zod'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpServer, CompleteResourceTemplateCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'
import type { TextResourceContents, BlobResourceContents } from '@modelcontextprotocol/sdk/types.js'

export const RESOURCE_TYPE_TEXT = 'text' as const
export const RESOURCE_TYPE_BLOB = 'blob' as const
export const RESOURCE_TYPES = [RESOURCE_TYPE_TEXT, RESOURCE_TYPE_BLOB] as const

export function textResourceUri(id: number): string {
  return `mcpflo://static/resource/text/${id}`
}

export function blobResourceUri(id: number): string {
  return `mcpflo://static/resource/blob/${id}`
}

export function textResource(uri: string, id: number): TextResourceContents {
  return {
    uri,
    mimeType: 'text/plain',
    text: `Resource ${id}: this is a plaintext demo/test fixture resource.`
  }
}

export function blobResource(uri: string, id: number): BlobResourceContents {
  const text = `Resource ${id}: this is a binary demo/test fixture resource.`
  return {
    uri,
    mimeType: 'application/octet-stream',
    blob: Buffer.from(text, 'utf-8').toString('base64')
  }
}

export const resourceTypeCompleter = completable(
  z.enum(RESOURCE_TYPES).describe('Type of resource: text or blob'),
  (value) => RESOURCE_TYPES.filter((t) => t.startsWith(value))
)

// resourceId stays a plain completable string, not a coerced number: prompt
// argument values always arrive as strings over the wire, and completion
// candidates need to be strings too — the numeric conversion happens where
// the value is actually used (see prompts/resource.ts), same as the
// reference's own handler-side Number(...) conversion.
export const resourceIdForPromptCompleter = completable(
  z.string().describe('ID of the resource'),
  (value) => ['1', '2', '3', '4', '5'].filter((id) => id.startsWith(value))
)

// Distinct namespace from the static mcpflo://static/resource/... URIs above,
// since these are genuinely different: dynamic MCP resource *templates*
// (resources/templates/list), content regenerated with a live timestamp on
// every read, deliberately excluded from resources/list (list: undefined).
const DYNAMIC_TEXT_URI_TEMPLATE = 'mcpflo://dynamic/text/{resourceId}'
const DYNAMIC_BLOB_URI_TEMPLATE = 'mcpflo://dynamic/blob/{resourceId}'

const resourceIdForResourceTemplateCompleter: CompleteResourceTemplateCallback = (value) => {
  const resourceId = Number(value)
  return Number.isInteger(resourceId) && resourceId > 0 ? [value] : []
}

function parseResourceId(variables: Variables): number {
  const raw = Array.isArray(variables.resourceId) ? variables.resourceId[0] : variables.resourceId
  const resourceId = Number(raw)
  if (!Number.isFinite(resourceId) || !Number.isInteger(resourceId) || resourceId < 1) {
    throw new Error(`Invalid resourceId: ${raw}. Must be a finite positive integer.`)
  }
  return resourceId
}

function dynamicTextContent(uri: URL, resourceId: number): TextResourceContents {
  return {
    uri: uri.toString(),
    mimeType: 'text/plain',
    text: `Resource ${resourceId}: dynamically generated plaintext resource, created at ${new Date().toISOString()}.`
  }
}

function dynamicBlobContent(uri: URL, resourceId: number): BlobResourceContents {
  const text = `Resource ${resourceId}: dynamically generated binary resource, created at ${new Date().toISOString()}.`
  return {
    uri: uri.toString(),
    mimeType: 'application/octet-stream',
    blob: Buffer.from(text, 'utf-8').toString('base64')
  }
}

export function registerResourceTemplates(server: McpServer): void {
  server.registerResource(
    'Dynamic Text Resource',
    new ResourceTemplate(DYNAMIC_TEXT_URI_TEMPLATE, {
      list: undefined,
      complete: { resourceId: resourceIdForResourceTemplateCompleter }
    }),
    {
      mimeType: 'text/plain',
      description:
        'Plaintext dynamic resource fabricated from the {resourceId} variable, which must be a positive integer. Demo/test fixture.'
    },
    async (uri, variables) => ({ contents: [dynamicTextContent(uri, parseResourceId(variables))] })
  )

  server.registerResource(
    'Dynamic Blob Resource',
    new ResourceTemplate(DYNAMIC_BLOB_URI_TEMPLATE, {
      list: undefined,
      complete: { resourceId: resourceIdForResourceTemplateCompleter }
    }),
    {
      mimeType: 'application/octet-stream',
      description:
        'Binary (base64) dynamic resource fabricated from the {resourceId} variable, which must be a positive integer. Demo/test fixture.'
    },
    async (uri, variables) => ({ contents: [dynamicBlobContent(uri, parseResourceId(variables))] })
  )
}
