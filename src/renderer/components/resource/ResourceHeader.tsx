import { Server, FileText } from 'lucide-react'
import type { Resource } from '../../../shared/mcp.types'

interface ResourceHeaderProps {
  resource: Resource
  serverName: string
}

export function ResourceHeader({ resource, serverName }: ResourceHeaderProps): React.JSX.Element {
  // Resources are identified by uri; the name is an optional display label, so
  // fall back to the uri when it's absent.
  const title = resource.name ?? resource.uri

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-text-primary text-lg font-medium font-mono truncate">{title}</h1>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border text-text-muted shrink-0">
          <Server size={11} />
          {serverName}
        </span>
        {resource.mimeType && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border border-border text-text-muted shrink-0">
            <FileText size={11} />
            {resource.mimeType}
          </span>
        )}
      </div>

      {resource.description && (
        <p className="text-text-muted text-sm leading-relaxed">{resource.description}</p>
      )}
    </div>
  )
}
