import { useMemo, useState } from 'react'
import {
  Wrench,
  Database,
  MessageSquare,
  Zap,
  FileText,
  Braces,
  FileCode,
  Hash
} from 'lucide-react'
import type { MCPServer, Resource, ResourceTemplate } from '../../../shared/mcp.types'
import { useServerStore } from '../../stores/serverStore'
import {
  computeContextBudget,
  estimatePromptTokens,
  estimateResourceTokens,
  estimateResourceTemplateTokens,
  estimateToolTokens
} from '../../lib/contextBudget'
import { CapabilitySection, type CapabilityRowData } from './CapabilitySection'

export type Category = 'tools' | 'resources' | 'resourceTemplates' | 'prompts'

interface CapabilitySectionsProps {
  server: MCPServer
  // Pre-expand only this one category (others start collapsed) — set by the
  // Overview tab's summary tiles. Read once on mount; this component remounts
  // whenever the Capabilities tab becomes active (ServerDetailView renders it
  // conditionally), so a fresh tile click always takes effect.
  initialFilter?: Category
}

// Mirrors the sidebar tree's fallback (SecondarySidebar's itemLabel): a
// resource without a friendly name displays as its uri, same as everywhere
// else in the app.
function resourceLabel(resource: Resource): string {
  return resource.name ?? resource.uri
}

// Same fallback for templates, whose uriTemplate plays the uri's role.
function templateLabel(template: ResourceTemplate): string {
  return template.name ?? template.uriTemplate
}

// One group per capability kind for the server details view — each collapsible
// independently. With no `initialFilter`, they all start expanded (a
// freshly-selected server shows every group open); with one, only that category
// starts expanded — the tile-jump case.
// Hidden entirely when the server has no capabilities, mirroring
// ContextBudgetCard so the two disappear together rather than leaving
// empty/disabled headers behind.
export function CapabilitySections({
  server,
  initialFilter
}: CapabilitySectionsProps): React.JSX.Element | null {
  const selectTool = useServerStore((s) => s.selectTool)
  const selectResource = useServerStore((s) => s.selectResource)
  const selectResourceTemplate = useServerStore((s) => s.selectResourceTemplate)
  const selectPrompt = useServerStore((s) => s.selectPrompt)
  const [expanded, setExpanded] = useState<Record<Category, boolean>>(() =>
    initialFilter
      ? {
          tools: initialFilter === 'tools',
          resources: initialFilter === 'resources',
          resourceTemplates: initialFilter === 'resourceTemplates',
          prompts: initialFilter === 'prompts'
        }
      : { tools: true, resources: true, resourceTemplates: true, prompts: true }
  )

  function toggle(category: Category): void {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  const { id: serverId, tools, resources, resourceTemplates, prompts } = server
  const budget = useMemo(
    () => computeContextBudget({ tools, resources, resourceTemplates, prompts }),
    [tools, resources, resourceTemplates, prompts]
  )

  if (budget.total.count === 0) return null

  const toolRows: CapabilityRowData[] = tools.map((tool) => ({
    key: tool.name,
    icon: <Zap size={13} />,
    label: tool.name,
    description: tool.description,
    tokens: estimateToolTokens(tool),
    onClick: () => selectTool(serverId, tool.name)
  }))

  const resourceRows: CapabilityRowData[] = resources.map((resource) => ({
    key: resource.uri,
    icon: <FileText size={13} />,
    label: resourceLabel(resource),
    description: resource.description,
    tokens: estimateResourceTokens(resource),
    onClick: () => selectResource(serverId, resource.uri)
  }))

  const templateRows: CapabilityRowData[] = resourceTemplates.map((template) => ({
    key: template.uriTemplate,
    icon: <FileCode size={13} />,
    label: templateLabel(template),
    description: template.description,
    tokens: estimateResourceTemplateTokens(template),
    onClick: () => selectResourceTemplate(serverId, template.uriTemplate)
  }))

  const promptRows: CapabilityRowData[] = prompts.map((prompt) => ({
    key: prompt.name,
    icon: <Hash size={13} />,
    label: prompt.name,
    description: prompt.description,
    tokens: estimatePromptTokens(prompt),
    onClick: () => selectPrompt(serverId, prompt.name)
  }))

  return (
    <div className="flex flex-col gap-3">
      <CapabilitySection
        icon={<Wrench size={13} />}
        label="Tools"
        count={budget.tools.count}
        tokens={budget.tools.tokens}
        expanded={expanded.tools}
        onToggle={() => toggle('tools')}
        rows={toolRows}
      />
      <CapabilitySection
        icon={<Database size={13} />}
        label="Resources"
        count={budget.resources.count}
        tokens={budget.resources.tokens}
        expanded={expanded.resources}
        onToggle={() => toggle('resources')}
        rows={resourceRows}
      />
      <CapabilitySection
        icon={<Braces size={13} />}
        label="Resource Templates"
        count={budget.resourceTemplates.count}
        tokens={budget.resourceTemplates.tokens}
        expanded={expanded.resourceTemplates}
        onToggle={() => toggle('resourceTemplates')}
        rows={templateRows}
      />
      <CapabilitySection
        icon={<MessageSquare size={13} />}
        label="Prompts"
        count={budget.prompts.count}
        tokens={budget.prompts.tokens}
        expanded={expanded.prompts}
        onToggle={() => toggle('prompts')}
        rows={promptRows}
      />
    </div>
  )
}
