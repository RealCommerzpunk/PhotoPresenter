import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out', 'dist', 'node_modules', 'resources'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-Skripte (z. B. Modelle laden)
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', fetch: 'readonly', Buffer: 'readonly', process: 'readonly' }
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  }
)
