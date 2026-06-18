import { useState } from 'react'
import type {
  SamplingContent,
  SamplingRequestEvent,
  SamplingResult
} from '../../../shared/mcp.types'
import { Modal } from '../ui/Modal'
import { useServerStore } from '../../stores/serverStore'

interface SamplingModalProps {
  request: SamplingRequestEvent
}

// Renders a content block as readable text: the `text` of a text block, or the
// raw JSON for image/audio/other blocks (MCPFlo doesn't decode media for v1).
function renderContent(content: SamplingContent): string {
  if (content.type === 'text' && typeof content.text === 'string') return content.text
  return JSON.stringify(content)
}

// A server's mid-call request to "complete" a conversation (sampling/
// createMessage). MCPFlo has no LLM, so the user writes the assistant turn by
// hand — keeping the exchange deterministic and fully visible. Accept sends the
// reply; Decline/Cancel return a JSON-RPC error to the server.
export function SamplingModal({ request }: SamplingModalProps): React.JSX.Element {
  const respondToSampling = useServerStore((s) => s.respondToSampling)

  const [text, setText] = useState('')
  const [model, setModel] = useState('mcpflo-manual')
  const [stopReason, setStopReason] = useState('endTurn')
  const [submitting, setSubmitting] = useState(false)

  const { messages, systemPrompt } = request.params

  async function respond(result: SamplingResult): Promise<void> {
    if (submitting) return
    setSubmitting(true)
    try {
      // respondToSampling always settles the request (it dismisses locally even
      // on failure), so on success this modal unmounts. The finally guards the
      // case where the reply rejects, so the buttons don't stay disabled.
      await respondToSampling(request.samplingId, result)
    } finally {
      setSubmitting(false)
    }
  }

  function handleAccept(): void {
    void respond({
      action: 'accept',
      content: { type: 'text', text },
      model: model.trim() || 'mcpflo-manual',
      stopReason: stopReason.trim() || undefined
    })
  }

  return (
    <Modal title="Sampling request" onClose={() => void respond({ action: 'cancel' })}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-text-muted font-mono">
          {request.serverName} · during {request.toolName}
        </p>

        {systemPrompt && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
              System
            </span>
            <p className="text-sm text-text-primary leading-snug whitespace-pre-wrap">
              {systemPrompt}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          {messages.map((message, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
                {message.role}
              </span>
              <p className="text-sm text-text-primary leading-snug whitespace-pre-wrap">
                {renderContent(message.content)}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sampling-reply" className="text-xs font-medium text-text-muted">
            Assistant reply
          </label>
          <textarea
            id="sampling-reply"
            aria-label="Assistant reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder="Type the assistant's response…"
            className="w-full px-3 py-2 rounded border border-border bg-bg-elevated text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors resize-y"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="sampling-model" className="text-xs font-medium text-text-muted">
              Model
            </label>
            <input
              id="sampling-model"
              aria-label="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-xs font-mono focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="sampling-stop" className="text-xs font-medium text-text-muted">
              Stop reason
            </label>
            <input
              id="sampling-stop"
              aria-label="Stop reason"
              value={stopReason}
              onChange={(e) => setStopReason(e.target.value)}
              className="w-full px-3 py-1.5 rounded border border-border bg-bg-elevated text-text-primary text-xs font-mono focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => void respond({ action: 'cancel' })}
            disabled={submitting}
            className="px-4 py-1.5 rounded text-sm text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void respond({ action: 'decline' })}
            disabled={submitting}
            className="px-4 py-1.5 rounded text-sm border border-border text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            disabled={submitting}
            className="px-4 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Accept
          </button>
        </div>
      </div>
    </Modal>
  )
}
