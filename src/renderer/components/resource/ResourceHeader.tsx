import { Server, FileText } from 'lucide-react'
import type { Resource } from '../../../shared/mcp.types'
import { Header, type MetaChip } from '../shared/Header'

interface ResourceHeaderProps {
  resource: Resource
  serverName: string
}

export function ResourceHeader({ resource, serverName }: ResourceHeaderProps): React.JSX.Element {
  // Resources are identified by uri; the name is an optional display label, so
  // fall back to the uri when it's absent.
  const title = resource.name ?? resource.uri

  const chips: MetaChip[] = [{ icon: <Server size={12} />, label: serverName }]
  if (resource.mimeType) {
    chips.push({ icon: <FileText size={12} />, label: resource.mimeType })
  }

  return <Header title={title} chips={chips} description={resource.description} />
}
