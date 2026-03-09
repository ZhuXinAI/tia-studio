import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

const reactRefreshRules = (() => {
  const nextRules = { ...eslintPluginReactRefresh.configs.vite.rules }
  delete nextRules['react-refresh/only-export-components']
  return nextRules
})()

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/.worktrees'] },
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
      ...reactRefreshRules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useTheme',
            'buttonVariants',
            'imageVariants',
            'reasoningVariants',
            'toolGroupVariants',
            'validateProviderForm',
            'parseProviderModelsInput',
            'shouldShowProviderModelsField'
          ]
        }
      ],
      // Disable strict rules that cause too many errors
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react/prop-types': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)
