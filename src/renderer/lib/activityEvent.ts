// The "All" history tab shows a unified, chronological log of everything that
// happened across every server: connection handshakes, capability listings, and
// every tool call / resource read / prompt get. Per-tool/resource/prompt history
// (the "This …" tab) keeps living in its own per-key maps; this module projects
// those existing records — plus a small slice of protocol-only events that have
// no per-key home — into one display-ready, newest-first list. Call records are
// therefore never stored twice: "All" is a *derived* view.

import type { ToolCallRecord, ResourceReadRecord, PromptGetRecord } from '../stores/serverStore'

// What an activity row represents. The first three mirror the per-key call
// records; the rest are protocol-level events captured when a server connects.
export type ActivityKind =
  | 'tool-call'
  | 'resource-read'
  | 'prompt-get'
  | 'connect'
  | 'list-tools'
  | 'list-resources'
  | 'list-prompts'

// Where a protocol event's data came from: a live wire exchange, or the on-disk
// capability cache replayed at startup (badged so the log doesn't imply a
// connection that didn't happen).
export type ActivitySource = 'live' | 'cache'

// A protocol-level event (connection handshake / capability listing) that isn't
// a tool, resource or prompt call and so has no per-key history of its own. It
// lives in its own flat slice on the store and is merged into the "All" view.
export interface ProtocolEvent {
  id: string
  kind: 'connect' | 'list-tools' | 'list-resources' | 'list-prompts'
  serverId: string
  // Server display name — the row's primary line.
  serverName: string
  status: 'success' | 'error'
  // Secondary line: a result summary ("5 tools") or an error message.
  detail: string
  // Whether this reflects a live exchange or cached capabilities (see above).
  source: ActivitySource
  durationMs: number
  at: number
}

// Where a call-type activity row points, so clicking it in the "All" tab can
// navigate to that tool/resource/prompt's detail view. Protocol rows have none.
export type ActivityTarget =
  | { kind: 'tool'; serverId: string; toolName: string }
  | { kind: 'resource'; serverId: string; uri: string }
  | { kind: 'prompt'; serverId: string; promptName: string }

// A unified, display-ready row for the "All" tab.
export interface ActivityEvent {
  id: string
  kind: ActivityKind
  serverId: string
  status: 'success' | 'error'
  durationMs: number
  at: number
  // Primary line: tool/prompt name, resource uri, or (for protocol rows) the
  // server name.
  label: string
  // Secondary line: an args summary or a result/error summary. Absent when
  // there's nothing useful to show.
  detail?: string
  // Set only on protocol rows sourced from the capability cache, so the row can
  // be badged "cached". Call rows are always live and leave this undefined.
  source?: ActivitySource
  // Present only for call-type rows; identifies the entity to navigate to.
  target?: ActivityTarget
}

function summarizeArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args)
  return json === '{}' ? 'no arguments' : json
}

export function toolCallToActivity(record: ToolCallRecord): ActivityEvent {
  return {
    id: record.id,
    kind: 'tool-call',
    serverId: record.serverId,
    status: record.status,
    durationMs: record.durationMs,
    at: record.at,
    label: record.toolName,
    detail: summarizeArgs(record.args),
    target: { kind: 'tool', serverId: record.serverId, toolName: record.toolName }
  }
}

export function resourceReadToActivity(record: ResourceReadRecord): ActivityEvent {
  return {
    id: record.id,
    kind: 'resource-read',
    serverId: record.serverId,
    status: record.status,
    durationMs: record.durationMs,
    at: record.at,
    label: record.uri,
    target: { kind: 'resource', serverId: record.serverId, uri: record.uri }
  }
}

export function promptGetToActivity(record: PromptGetRecord): ActivityEvent {
  return {
    id: record.id,
    kind: 'prompt-get',
    serverId: record.serverId,
    status: record.status,
    durationMs: record.durationMs,
    at: record.at,
    label: record.promptName,
    detail: summarizeArgs(record.args),
    target: { kind: 'prompt', serverId: record.serverId, promptName: record.promptName }
  }
}

export function protocolToActivity(event: ProtocolEvent): ActivityEvent {
  return {
    id: event.id,
    kind: event.kind,
    serverId: event.serverId,
    status: event.status,
    durationMs: event.durationMs,
    at: event.at,
    label: event.serverName,
    detail: event.detail,
    source: event.source
  }
}

// Folds the three per-key call-history maps and the flat protocol-event slice
// into one newest-first list for the "All" tab. Pure and derivable, so it's
// computed in a memo at the call site rather than stored.
export function mergeActivity(
  history: Record<string, ToolCallRecord[]>,
  resourceHistory: Record<string, ResourceReadRecord[]>,
  promptHistory: Record<string, PromptGetRecord[]>,
  protocolEvents: ProtocolEvent[]
): ActivityEvent[] {
  const events: ActivityEvent[] = []
  for (const records of Object.values(history)) {
    for (const record of records) events.push(toolCallToActivity(record))
  }
  for (const records of Object.values(resourceHistory)) {
    for (const record of records) events.push(resourceReadToActivity(record))
  }
  for (const records of Object.values(promptHistory)) {
    for (const record of records) events.push(promptGetToActivity(record))
  }
  for (const event of protocolEvents) events.push(protocolToActivity(event))
  return events.sort((a, b) => b.at - a.at)
}
