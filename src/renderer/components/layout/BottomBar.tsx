import { Sun, Moon, MessageCircleQuestion, RefreshCw, Download } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useErrorStore } from '../../stores/errorStore'
import { Tooltip } from '../ui/Tooltip'

const ISSUES_URL = 'https://github.com/harshalslimaye/mcpflo/issues'

const mutedButtonClass =
  'flex items-center gap-1.5 h-[28px] px-2 rounded-[8px] text-xs text-fg-faint hover:text-text-muted hover:bg-card-2 transition-colors disabled:cursor-default'

function UpdateControl(): React.JSX.Element | null {
  const status = useUpdaterStore((s) => s.status)
  const check = useUpdaterStore((s) => s.check)
  const install = useUpdaterStore((s) => s.install)
  const pushError = useErrorStore((s) => s.pushError)

  if (!status) return null

  const handleCheck = async (): Promise<void> => {
    await check()
    // Only a *manual* check surfaces a toast on failure — the silent startup
    // check just logs in the main process and leaves the button as-is.
    const result = useUpdaterStore.getState().status
    if (result?.state === 'error') pushError(result.message ?? 'Update check failed')
  }

  if (status.state === 'checking' || status.state === 'downloading') {
    const label =
      status.state === 'downloading' && status.percent !== undefined
        ? `Downloading update ${Math.round(status.percent)}%`
        : 'Checking for updates…'
    return (
      <Tooltip label={label} side="top">
        <button aria-label={label} disabled className={mutedButtonClass}>
          <RefreshCw size={13} className="animate-spin" />
          <span>v{status.currentVersion}</span>
        </button>
      </Tooltip>
    )
  }

  if (status.state === 'downloaded') {
    const label = `Restart to install v${status.availableVersion ?? ''}`
    return (
      <Tooltip label={label} side="top">
        <button
          aria-label="Restart to update"
          onClick={() => void install()}
          className="flex items-center gap-1.5 h-[28px] px-2 rounded-[8px] text-xs font-medium text-accent bg-accent-soft hover:bg-accent-soft/70 transition-colors"
        >
          <Download size={13} />
          <span>Restart to update</span>
        </button>
      </Tooltip>
    )
  }

  const tooltipLabel = status.state === 'error' ? 'Update check failed' : 'Check for updates'
  return (
    <Tooltip label={tooltipLabel} side="top">
      <button
        aria-label="Check for updates"
        onClick={() => void handleCheck()}
        className={mutedButtonClass}
      >
        <span>v{status.currentVersion}</span>
      </button>
    </Tooltip>
  )
}

export function BottomBar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <div className="flex items-center justify-start h-[34px] px-2 bg-rail border-t border-border shrink-0">
      <Tooltip label="Report an Issue" side="top">
        <button
          aria-label="Report an Issue"
          onClick={() => window.open(ISSUES_URL, '_blank')}
          className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px] text-fg-faint hover:text-text-muted hover:bg-card-2 transition-colors"
        >
          <MessageCircleQuestion size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Toggle Theme" side="top">
        <button
          aria-label="Toggle Theme"
          onClick={toggleTheme}
          className="flex items-center justify-center w-[28px] h-[28px] rounded-[8px] text-fg-faint hover:text-text-muted hover:bg-card-2 transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </Tooltip>
      <div className="ml-auto">
        <UpdateControl />
      </div>
    </div>
  )
}
