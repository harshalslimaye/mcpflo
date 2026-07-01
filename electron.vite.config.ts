import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {
    // Sandboxed preload scripts (webPreferences.sandbox: true) can only
    // require() Electron/Node builtins, not arbitrary node_modules, so
    // @electron-toolkit/preload must be bundled in rather than left as an
    // external require like electron-vite's default externalizeDeps does.
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [tailwindcss(), react()]
  }
})
