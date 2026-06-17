import { Server, Hash } from 'lucide-react'
import type { Prompt } from '../../../shared/mcp.types'
import { Header, type MetaChip } from '../shared/Header'

interface PromptHeaderProps {
  prompt: Prompt
  serverName: string
}

export function PromptHeader({ prompt, serverName }: PromptHeaderProps): React.JSX.Element {
  const argCount = prompt.arguments?.length ?? 0

  const chips: MetaChip[] = [{ icon: <Server size={12} />, label: serverName }]
  if (argCount > 0) {
    chips.push({
      icon: <Hash size={12} />,
      label: `${argCount} ${argCount === 1 ? 'argument' : 'arguments'}`
    })
  }

  return <Header title={prompt.name} chips={chips} description={prompt.description} />
}
