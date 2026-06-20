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
