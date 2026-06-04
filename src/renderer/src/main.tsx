import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useThemeStore } from '../stores/themeStore'

// Apply persisted theme before first render to prevent flash
const { theme, setTheme } = useThemeStore.getState()
setTheme(theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
