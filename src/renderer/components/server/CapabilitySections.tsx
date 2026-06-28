import { useMemo, useState } from 'react'
import { Wrench, Database, MessageSquare, Zap, FileText, Hash } from 'lucide-react'
import type { MCPServer, Resource } from '../../../shared/mcp.types'
import { useServerStore } from '../../stores/serverStore'
import {
  computeContextBudget,
  estimatePromptTokens,
  estimateResourceTokens,
  estimateToolTokens
} from '../../lib/contextBudget'
import { CapabilitySection, type CapabilityRowData } from './CapabilitySection'

interface CapabilitySectionsProps {
  server: MCPServer
}

// Mirrors the sidebar tree's fallback (SecondarySidebar's itemLabel): a
// resource without a friendly name displays as its uri, same as everywhere
// else in the app.
function resourceLabel(resource: Resource): string {
  return resource.name ?? resource.uri
}

type Category = 'tools' | 'resources' | 'prompts'

// Tools/Resources/Prompts groups for the server details view — each
// collapsible independently, all expanded by default (matching the mockup,
// where a freshly-selected server shows every group open). Hidden entirely
// when the server has no capabilities, mirroring ContextBudgetCard so the two
// disappear together rather than leaving empty/disabled headers behind.
export function CapabilitySections({ server }: CapabilitySectionsProps): React.JSX.Element | null {
  const selectTool = useServerStore((s) => s.selectTool)
  const selectResource = useServerStore((s) => s.selectResource)
  const selectPrompt = useServerStore((s) => s.selectPrompt)
  const [expanded, setExpanded] = useState<Record<Category, boolean>>({
    tools: true,
    resources: true,
    prompts: true
  })

  function toggle(category: Category): void {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }))
  }

  const { id: serverId, tools, resources, prompts } = server
  const budget = useMemo(
    () => computeContextBudget({ tools, resources, prompts }),
    [tools, resources, prompts]
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
