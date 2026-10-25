import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    '**/.wrangler/**',
    '**/node_modules/**',
    'experiments/**/dist/**',
    'experiments/**/experiments/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['experiments/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_|options|ctx|workerEnv',
          caughtErrors: 'none',
        },
      ],
    },
  },
])
