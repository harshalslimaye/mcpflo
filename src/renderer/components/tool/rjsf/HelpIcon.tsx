import { Info } from 'lucide-react'
import { Tooltip } from '../../ui/Tooltip'

// The form shows no inline help text; a field's description lives behind this
// hover/focus `i` icon next to its label. Renders nothing when there's no text.
export function HelpIcon({ text }: { text?: string }): React.JSX.Element | null {
  if (!text) return null
  return (
    <Tooltip label={text} side="top">
      <button
        type="button"
        aria-label="Field help"
        className="inline-flex cursor-help items-center text-text-muted transition-colors hover:text-text-primary"
      >
        <Info size={13} />
      </button>
    </Tooltip>
  )
}
