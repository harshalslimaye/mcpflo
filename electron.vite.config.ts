import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // chai is only ever consumed as raw source text (`chai/chai.js?raw`) that
    // the test-engine sandbox evaluates inside QuickJS. Left externalized, the
    // main bundle would emit a literal `require("chai/chai.js?raw")`, which
    // Node can't resolve at runtime (`?raw` is Vite-only) — the packaged app
    // would crash the moment the engine loads. Excluding it makes Vite inline
    // the file's text into the bundle at build time instead.
    build: {
      externalizeDeps: { exclude: ['chai'] }
    }
  },
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
