import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  function copy(): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy JSON"
      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded text-xs border border-border bg-bg-primary text-text-muted hover:text-text-primary transition-colors"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
