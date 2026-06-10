import type { ToolInputSchema } from '../../../shared/mcp.types'

interface SchemaTabProps {
  schema: ToolInputSchema
}

// Read-only, pretty-printed view of the tool's raw inputSchema. No JSON
// highlighter exists in the codebase, so this is a plain monospace block.
export function SchemaTab({ schema }: SchemaTabProps): React.JSX.Element {
  return (
    <pre className="font-mono text-xs leading-relaxed text-text-primary bg-bg-elevated border border-border rounded p-3 overflow-x-auto whitespace-pre">
      {JSON.stringify(schema, null, 2)}
    </pre>
  )
}
