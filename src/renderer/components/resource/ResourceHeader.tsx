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
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-mono text-[23px] font-semibold tracking-[-0.01em] text-text-primary">
          {title}
        </h1>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-border bg-bg-elevated px-2 py-[3px] text-[11.5px] text-text-muted">
          <Server size={12} />
          {serverName}
        </span>
        {resource.mimeType && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[6px] border border-border bg-bg-elevated px-2 py-[3px] text-[11.5px] text-text-muted">
            <FileText size={12} />
            {resource.mimeType}
          </span>
        )}
      </div>

      {resource.description && (
        <p className="text-text-muted text-[13.5px] leading-[1.55] max-w-[72ch]">
          {resource.description}
        </p>
      )}
    </div>
  )
}
