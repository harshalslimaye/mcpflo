import { Server, FileText, Braces } from 'lucide-react'
import type { ResourceTemplate } from '../../../shared/mcp.types'
import { Header, type MetaChip } from '../shared/Header'

interface ResourceTemplateHeaderProps {
  template: ResourceTemplate
  serverName: string
}

export function ResourceTemplateHeader({
  template,
  serverName
}: ResourceTemplateHeaderProps): React.JSX.Element {
  // Templates are identified by uriTemplate; the name is an optional display
  // label, so fall back to the template when it's absent — same rule the
  // sidebar and Capabilities tab use.
  const title = template.name ?? template.uriTemplate

  const chips: MetaChip[] = [{ icon: <Server size={12} />, label: serverName }]
  // A named template would otherwise never show its shape: the request panel
  // previews the *expanded* URI, so without this the variables the user is
  // filling in have no visible source. Skipped when the title already is the
  // template, rather than printing it twice.
  if (template.name) {
    chips.push({ icon: <Braces size={12} />, label: template.uriTemplate })
  }
  if (template.mimeType) {
    chips.push({ icon: <FileText size={12} />, label: template.mimeType })
  }

  return <Header title={title} chips={chips} description={template.description} />
}
