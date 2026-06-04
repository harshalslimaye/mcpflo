import { Server } from 'lucide-react'

export function ContentArea(): React.JSX.Element {
  return (
    <div className="flex-1 h-full bg-bg-primary overflow-y-auto flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Server size={48} className="text-text-muted" />
        <div className="flex flex-col items-center gap-1">
          <span className="text-text-primary text-sm font-medium">Select an MCP Server</span>
          <span className="text-text-muted text-sm">or tool to get started</span>
        </div>
      </div>
    </div>
  )
}
