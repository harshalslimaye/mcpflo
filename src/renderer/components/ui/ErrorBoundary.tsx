import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// Catches render-time throws anywhere below it so a single bad component (e.g. a
// detail view choking on an unexpected response shape) shows a recoverable
// fallback instead of white-screening the whole renderer.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the stack in the console for debugging; the UI shows a summary.
    console.error('Renderer crashed:', error, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center w-full h-full gap-4 p-8 bg-bg-primary">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-text-primary text-base font-medium">Something went wrong</h1>
          <p className="text-text-muted text-sm max-w-md break-words">{error.message}</p>
        </div>
        <button
          onClick={this.handleReload}
          className="px-3 py-1.5 rounded text-sm bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          Reload
        </button>
      </div>
    )
  }
}
