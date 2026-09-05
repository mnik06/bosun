import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

/**
 * Two-tier lint policy.
 *
 * TIER 1 — complexity rules. They measure logic, so they are shape-independent
 * and are never switched off for production code. If one of these fires, the
 * code is genuinely too complex and must be refactored.
 *
 * TIER 2 — size rules (max-lines, max-lines-per-function). These are only
 * proxies for complexity. Where the proxy structurally mismeasures a shape (a
 * component function whose body is a JSX tree, a hook body, a column catalog
 * whose length tracks its column count) the size rule is switched off for that
 * shape below — Tier 1 still guards it.
 *
 * Exemptions are granted two ways, and no other way:
 *   - a recurring shape  -> a glob in this file, with the reason stated
 *   - a one-off          -> `// eslint-disable-next-line <rule> -- <reason>`
 * `reportUnusedDisableDirectives` keeps the second kind from going stale.
 */

export default defineConfig(
	globalIgnores([
		'build/**',
		'dist/**',
		'public/**',
		'.react-router/**',
		'node_modules/**'
	]),

	tseslint.configs.strictTypeChecked,
	tseslint.configs.stylisticTypeChecked,
	reactPlugin.configs.flat.recommended,
	reactPlugin.configs.flat['jsx-runtime'],
	reactHooks.configs.flat['recommended-latest'],
	jsxA11y.flatConfigs.strict,

	{
		files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
		linterOptions: {
			reportUnusedDisableDirectives: 'error'
		},
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir,
				ecmaFeatures: { jsx: true }
			}
		},
		settings: {
			react: { version: 'detect' }
		},
		plugins: {
			'react-refresh': reactRefresh,
			sonarjs
		},
		rules: {
			// Hard ban on `any` — even when written explicitly.
			'@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: false }],

			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'inline-type-imports' }
			],
			'@typescript-eslint/no-import-type-side-effects': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/switch-exhaustiveness-check': 'error',
			'@typescript-eslint/promise-function-async': 'error',
			'@typescript-eslint/return-await': ['error', 'in-try-catch'],
			'@typescript-eslint/require-await': 'off',
			'@typescript-eslint/restrict-template-expressions': [
				'error',
				{ allowNumber: true, allowNullish: true, allowBoolean: true }
			],

			'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
			'react/no-unstable-nested-components': 'error',
			'react/hook-use-state': 'off',
			'react/self-closing-comp': 'error',
			'react/jsx-boolean-value': ['error', 'never'],
			'react/prop-types': 'off',

			'semi': ['error', 'never'],
			'indent': ['error', 'tab', { 'SwitchCase': 1 }],
			'quotes': ['error', 'single'],
			'newline-before-return': 'error',
			'no-multiple-empty-lines': ['error', { max: 1 }],
			'padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: 'const', next: 'if' }
			],
			'space-before-function-paren': ['error', 'always'],
			'comma-dangle': 'error',
			'no-trailing-spaces': 'error',

			// ---- TIER 1: complexity. Never exempted for production code. ----
			'sonarjs/cognitive-complexity': ['error', 15],
			'sonarjs/no-nested-conditional': 'error',
			'sonarjs/no-identical-functions': 'error',
			'sonarjs/no-duplicated-branches': 'error',
			'sonarjs/no-collapsible-if': 'error',
			'sonarjs/no-identical-expressions': 'error',
			'sonarjs/prefer-single-boolean-return': 'error',
			'sonarjs/no-redundant-jump': 'error',
			'sonarjs/no-inverted-boolean-check': 'error',
			'sonarjs/no-gratuitous-expressions': 'error',
			'max-depth': ['error', 4],
			'max-nested-callbacks': ['error', 3],

			// ---- TIER 2: size proxies. Exemptible per shape, see overrides below. ----
			'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
			'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }]
		}
	},

	// Components: the function body is the whole JSX tree, so its line count
	// tracks markup, not branching. The 300-line FILE cap deliberately stays on —
	// the only way to shrink an oversized page is to extract real sub-components.
	{
		files: ['**/*.tsx'],
		rules: {
			'max-lines-per-function': 'off'
		}
	},

	// Hook bodies are component-shaped: a linear run of useState/useMemo/useCallback
	// with no branching to collapse.
	{
		files: ['**/use-*.ts', 'app/shared/hooks/**/*.ts'],
		rules: {
			'max-lines-per-function': 'off'
		}
	},

	// Declaration catalogs: length tracks the number of entries declared, not
	// logic. Nothing to simplify by splitting the file.
	{
		files: ['**/*.queries.ts'],
		rules: {
			'max-lines': 'off'
		}
	},

	{
		files: ['**/*.test.{ts,tsx}'],
		rules: {
			'sonarjs/no-identical-functions': 'off',
			'max-nested-callbacks': 'off',
			'max-lines': 'off',
			'max-lines-per-function': 'off',
			'sonarjs/cognitive-complexity': 'off',
			'sonarjs/no-nested-conditional': 'off'
		}
	},

	{
		files: ['**/*.{js,mjs,cjs}', '**/*.config.{js,ts,mjs,cts,mts}'],
		extends: [tseslint.configs.disableTypeChecked]
	}
)
