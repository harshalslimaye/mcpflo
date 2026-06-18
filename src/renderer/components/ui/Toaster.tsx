import { createPortal } from 'react-dom'
import { X, AlertCircle } from 'lucide-react'
import { useErrorStore } from '../../stores/errorStore'

// Mounted once at the app root: renders the stack of app-level error toasts
// pushed to the error store. These are MCPFlo's own failures — server-protocol
// errors surface in the result panels, not here.
export function Toaster(): React.JSX.Element | null {
  const toasts = useErrorStore((s) => s.toasts)
  const dismiss = useErrorStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-full max-w-sm"
      role="region"
      aria-label="Errors"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/40 bg-bg-surface shadow-xl"
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
          <p className="flex-1 text-xs text-text-primary leading-snug break-words">
            {toast.message}
          </p>
          <button
            aria-label="Dismiss"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  )
}
