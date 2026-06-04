import { Server, GitBranch, Settings, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { Tooltip } from '../ui/Tooltip'

interface SidebarButtonProps {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}

function SidebarButton({ label, active, onClick, children }: SidebarButtonProps): React.JSX.Element {
  return (
    <Tooltip label={label} side="right">
      <button
        aria-label={label}
        onClick={onClick}
        className={`p-3 rounded-md transition-colors ${
          active
            ? 'text-accent'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const topItems = [
  { icon: Server, label: 'MCP Servers', active: true },
  { icon: GitBranch, label: 'Workflows' },
]

export function PrimarySidebar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <div className="flex flex-col items-center w-12 h-full bg-bg-surface border-r border-border shrink-0">
      <div className="flex flex-col items-center gap-2 pt-2 flex-1">
        {topItems.map(({ icon: Icon, label, active }) => (
          <SidebarButton key={label} label={label} active={active}>
            <Icon size={20} />
          </SidebarButton>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 pb-2">
        <SidebarButton label="Toggle Theme" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </SidebarButton>
        <SidebarButton label="Settings">
          <Settings size={20} />
        </SidebarButton>
      </div>
    </div>
  )
}
