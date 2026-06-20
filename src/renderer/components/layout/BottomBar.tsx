import { Sun, Moon, MessageCircleQuestion } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { Tooltip } from '../ui/Tooltip'

const ISSUES_URL = 'https://github.com/harshalslimaye/mcpflo/issues'

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
    </div>
  )
}
