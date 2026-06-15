import { Server, GitBranch, Settings, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../../stores/themeStore'
import { Tooltip } from '../ui/Tooltip'

interface SidebarButtonProps {
  label: string
  active?: boolean
  onClick?: () => void
  children: React.ReactNode
}

function SidebarButton({
  label,
  active,
  onClick,
  children
}: SidebarButtonProps): React.JSX.Element {
  return (
    <Tooltip label={label} side="right">
      <button
        aria-label={label}
        onClick={onClick}
        className={`flex items-center justify-center w-[34px] h-[34px] rounded-[8px] transition-colors ${
          active
            ? 'text-accent bg-accent-soft'
            : 'text-fg-faint hover:text-text-muted hover:bg-card-2'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const topItems = [
  { icon: Server, label: 'MCP Servers', active: true },
  { icon: GitBranch, label: 'Workflows' }
]

export function PrimarySidebar(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <div className="flex flex-col items-center w-[52px] h-full bg-rail border-r border-border shrink-0">
      <div className="flex flex-col items-center gap-1.5 pt-[14px] flex-1">
        {topItems.map(({ icon: Icon, label, active }) => (
          <SidebarButton key={label} label={label} active={active}>
            <Icon size={18} />
          </SidebarButton>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1.5 pb-[14px]">
        <SidebarButton label="Toggle Theme" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </SidebarButton>
        <SidebarButton label="Settings">
          <Settings size={18} />
        </SidebarButton>
      </div>
    </div>
  )
}
