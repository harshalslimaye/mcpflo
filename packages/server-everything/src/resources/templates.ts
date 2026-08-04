import { z } from 'zod'
import { completable } from '@modelcontextprotocol/sdk/server/completable.js'
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type {
  McpServer,
  CompleteResourceTemplateCallback
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js'
import type { TextResourceContents, BlobResourceContents } from '@modelcontextprotocol/sdk/types.js'
import { DEPARTMENTS, DEPARTMENT_MEMBERS, completeDepartment, completeMember } from '../data/team'

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

// The ids this fixture server offers as completions. Shared by the prompt
// argument and the template variable below, which name the same resources.
const COMPLETABLE_RESOURCE_IDS = ['1', '2', '3', '4', '5']

// resourceId stays a plain completable string, not a coerced number: prompt
// argument values always arrive as strings over the wire, and completion
// candidates need to be strings too — the numeric conversion happens where
// the value is actually used (see prompts/resource.ts), same as the
// reference's own handler-side Number(...) conversion.
export const resourceIdForPromptCompleter = completable(
  z.string().describe('ID of the resource'),
  (value) => COMPLETABLE_RESOURCE_IDS.filter((id) => id.startsWith(value))
)

// Distinct namespace from the static mcpflo://static/resource/... URIs above,
// since these are genuinely different: dynamic MCP resource *templates*
// (resources/templates/list), content regenerated with a live timestamp on
// every read, deliberately excluded from resources/list (list: undefined).
const DYNAMIC_TEXT_URI_TEMPLATE = 'mcpflo://dynamic/text/{resourceId}'
const DYNAMIC_BLOB_URI_TEMPLATE = 'mcpflo://dynamic/blob/{resourceId}'
// Two variables, where the second one's completions depend on the first. The
// pair above can't express that: a single variable has no sibling to depend on,
// so a client asking for completions always sends an empty context.
const DYNAMIC_REPORT_URI_TEMPLATE = 'mcpflo://dynamic/report/{department}/{member}'
// Form-style query expansion rather than path segments: `{?q,limit}` becomes
// `?q=…&limit=…`, not `/…/…`. Every other template here is a simple `{var}`
// path substitution, which is the one RFC 6570 form a client could get away
// with implementing as a regex — this one it can't.
//
// `limit` deliberately gets no completer while `q` does, so the two variables
// of one template differ in whether the server has anything to suggest.
const DYNAMIC_SEARCH_URI_TEMPLATE = 'mcpflo://dynamic/search{?q,limit}'

// Canned queries, so `q` has something to offer without pretending this
// fixture has a corpus behind it.
const COMPLETABLE_SEARCH_QUERIES = ['completion', 'prompts', 'resources', 'templates', 'tools']

const MAX_SEARCH_LIMIT = 10
// A fixed pretend corpus size, so a read can report "n of TOTAL" without the
// number moving around between reads.
const TOTAL_SEARCH_MATCHES = 42

// Suggests the ids this server actually has, filtered by what's been typed —
// the same shape as the prompt completer above. It previously echoed any
// positive integer straight back, which meant typing "7" suggested "7": a
// completion that tells the user nothing they didn't just write, and nothing
// for a test to assert beyond the echo.
const resourceIdForResourceTemplateCompleter: CompleteResourceTemplateCallback = (value) =>
  COMPLETABLE_RESOURCE_IDS.filter((id) => id.startsWith(value))

// A template variable arrives as a string, or as a string[] for the RFC 6570
// explode forms. None of the templates here declare one, but the type admits it,
// so the first value stands in for the whole rather than stringifying an array.
function firstValue(variables: Variables, name: string): string {
  const raw = variables[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return value ?? ''
}

function parseResourceId(variables: Variables): number {
  const raw = firstValue(variables, 'resourceId')
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

// Validated against the roster rather than accepted as free text, so a read
// assembled by hand — or from a completion for the wrong department — fails
// loudly instead of fabricating a report about someone who doesn't exist.
function parseReportVariables(variables: Variables): { department: string; member: string } {
  const department = firstValue(variables, 'department')
  const member = firstValue(variables, 'member')

  const members = DEPARTMENT_MEMBERS[department]
  if (!members) {
    throw new Error(
      `Unknown department: ${department}. Expected one of: ${DEPARTMENTS.join(', ')}.`
    )
  }
  if (!members.includes(member)) {
    throw new Error(`Unknown member: ${member}. ${department} has: ${members.join(', ')}.`)
  }
  return { department, member }
}

function dynamicReportContent(uri: URL, department: string, member: string): TextResourceContents {
  return {
    uri: uri.toString(),
    mimeType: 'text/plain',
    text: `Report for ${member} of ${department}: dynamically generated plaintext resource, created at ${new Date().toISOString()}.`
  }
}

// UriTemplate.match() returns variables exactly as they appeared in the URI —
// it reverses the template's *structure*, not its percent-encoding, so a `q` of
// "hello world" comes back as "hello%20world". The path templates above never
// notice: their values are ids and roster names that survive encoding
// unchanged. A free-text query does notice, so it gets decoded here.
//
// A value can be encoded but not decodable (a lone "%" is a legal character in
// a URI and throws in decodeURIComponent). Treating that as "no decoding
// needed" keeps a malformed read reporting the query it was given rather than
// failing with a URIError that says nothing about resources.
function decodedValue(variables: Variables, name: string): string {
  const raw = firstValue(variables, name)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function parseSearchLimit(variables: Variables): number {
  const raw = decodedValue(variables, 'limit')
  const limit = Number(raw)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SEARCH_LIMIT) {
    throw new Error(`Invalid limit: ${raw}. Must be an integer between 1 and ${MAX_SEARCH_LIMIT}.`)
  }
  return limit
}

function dynamicSearchContent(uri: URL, query: string, limit: number): TextResourceContents {
  const matches = Array.from({ length: limit }, (_, i) => `${i + 1}. ${query} — match ${i + 1}`)
  return {
    uri: uri.toString(),
    mimeType: 'text/plain',
    text: [
      `Search for "${query}": ${limit} of ${TOTAL_SEARCH_MATCHES} matches, dynamically generated at ${new Date().toISOString()}.`,
      ...matches
    ].join('\n')
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

  server.registerResource(
    'Dynamic Team Report',
    new ResourceTemplate(DYNAMIC_REPORT_URI_TEMPLATE, {
      list: undefined,
      complete: {
        department: (value) => completeDepartment(value),
        // The half this fixture exists for: the candidates come from the
        // sibling variable the client sends back as context, not from `value`
        // alone. With no department filled in there is nothing to suggest.
        member: (value, context) => completeMember(value, context?.arguments?.['department'])
      }
    }),
    {
      mimeType: 'text/plain',
      description:
        'Plaintext dynamic resource fabricated from the {department} and {member} variables, which must name a real team. The {member} completions depend on the {department} already filled in. Demo/test fixture.'
    },
    async (uri, variables) => {
      const { department, member } = parseReportVariables(variables)
      return { contents: [dynamicReportContent(uri, department, member)] }
    }
  )

  server.registerResource(
    'Dynamic Search Result',
    new ResourceTemplate(DYNAMIC_SEARCH_URI_TEMPLATE, {
      list: undefined,
      // Only `q`. `limit` is left out on purpose: a client has to cope with a
      // template whose variables don't all have something behind them, and
      // there is nothing sensible to suggest for a free-form number anyway.
      complete: {
        q: (value) => COMPLETABLE_SEARCH_QUERIES.filter((query) => query.startsWith(value))
      }
    }),
    {
      mimeType: 'text/plain',
      description: `Plaintext dynamic resource fabricated from the {?q,limit} query variables — free-text q, and limit as an integer between 1 and ${MAX_SEARCH_LIMIT}. Expands to a query string rather than path segments, and only q offers completions. Demo/test fixture.`
    },
    async (uri, variables) => ({
      contents: [
        dynamicSearchContent(uri, decodedValue(variables, 'q'), parseSearchLimit(variables))
      ]
    })
  )
}
