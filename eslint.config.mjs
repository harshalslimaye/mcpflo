import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  // Dev-only helper scripts and the test-runner config follow plain-JS/Node
  // conventions (semicolons, no TS annotations) rather than the app's style, so
  // they're exempt from the TypeScript/prettier rules applied to src.
  {
    ignores: ['**/node_modules', '**/dist', '**/out', 'scripts/**', 'build/**', 'vitest.config.ts']
  },
  // bootstrap.js is never run by Node/tsc — it's evaluated as source text
  // inside the QuickJS test sandbox (src/main/testing/sandbox.ts), where
  // `chai`, `console`, etc. are globals the bootstrap itself defines or
  // expects the host to have injected. TS-aware rules like `no-undef` and
  // `explicit-function-return-type` don't apply to that runtime.
  {
    ignores: ['src/main/testing/bootstrap.js']
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  // The RJSF theme registry files intentionally co-locate several small
  // widget/template components with the registry objects that group them, so the
  // Fast-Refresh "one component per file" rule doesn't apply.
  {
    files: ['src/renderer/components/tool/rjsf/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },
  eslintConfigPrettier
)
