import { useThemeStore } from '../stores/themeStore'

function App(): React.JSX.Element {
  const { theme, toggleTheme } = useThemeStore()

  return (
    <div className="min-h-screen bg-bg-primary p-8">
      <div className="bg-bg-surface border border-border rounded-lg p-6 max-w-sm">
        <p className="text-text-primary text-lg font-medium mb-1">MCPFlo</p>
        <p className="text-text-muted text-sm mb-4">Current theme: {theme}</p>
        <button
          onClick={toggleTheme}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm"
        >
          Toggle theme
        </button>
      </div>
    </div>
  )
}

export default App
