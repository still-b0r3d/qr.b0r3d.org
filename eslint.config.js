import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['src/sw/**'],
    languageOptions: { globals: globals.serviceworker }
  },
  {
    files: ['scripts/**', 'tests/e2e/**', '*.config.*', 'src/test/**', 'src/**/*.test.ts'],
    languageOptions: { globals: globals.node }
  }
)
