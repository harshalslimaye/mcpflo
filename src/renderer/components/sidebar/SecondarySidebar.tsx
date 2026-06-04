import { ChevronRight } from 'lucide-react'

const servers = [
  { name: 'GitHub MCP', tools: 4, resources: 2, prompts: 1 },
  { name: 'Slack MCP', tools: 6, resources: 0, prompts: 0 },
  { name: 'PostgreSQL MCP', tools: 3, resources: 1, prompts: 0 },
]

export function SecondarySidebar(): React.JSX.Element {
  return (
    <div className="flex flex-col w-60 h-full bg-bg-primary border-r border-border shrink-0 overflow-y-auto">
      <div className="px-3 pt-4 pb-2">
        <span className="text-text-muted text-xs uppercase tracking-wider font-medium">
          MCP Servers
        </span>
      </div>

      <div className="px-3 pb-3">
        <button className="text-accent text-sm hover:text-accent-hover transition-colors">
          + Add Server
        </button>
      </div>

      <div className="flex flex-col">
        {servers.map((server) => (
          <div key={server.name} className="px-3 py-2 border-t border-border">
            <div className="flex items-center gap-1 text-text-primary text-sm mb-1">
              <ChevronRight size={14} className="text-text-muted shrink-0" />
              <span>{server.name}</span>
            </div>
            <div className="pl-5 flex flex-col gap-0.5">
              {[
                { label: 'Tools', count: server.tools },
                { label: 'Resources', count: server.resources },
                { label: 'Prompts', count: server.prompts },
              ].map(({ label, count }) => (
                <div key={label} className="flex justify-between text-text-muted text-xs">
                  <span>{label}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
