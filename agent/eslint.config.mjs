import globals from 'globals';
import pluginJs from '@eslint/js';
import sonarjs from 'eslint-plugin-sonarjs';
import tsEslint from 'typescript-eslint';

/**
 * Two-tier lint policy.
 *
 * TIER 1 — complexity rules. They measure logic, so they are shape-independent
 * and are never switched off for production code. If one of these fires, the
 * code is genuinely too complex and must be refactored.
 *
 * TIER 2 — size rules (max-lines, max-lines-per-function, max-len). These are
 * only proxies for complexity. Where the proxy structurally mismeasures a shape
 * (a session factory that returns an object of N small handlers, a prompt
 * catalog whose length tracks its prose) the size rule is switched off
 * for that shape below — Tier 1 still guards it.
 *
 * Exemptions are granted two ways, and no other way:
 *   - a recurring shape  -> a glob in this file, with the reason stated
 *   - a one-off          -> `// eslint-disable-next-line <rule> -- <reason>`
 * `reportUnusedDisableDirectives` keeps the second kind from going stale.
 */
export default [
  {
    ignores: ['dist/', 'release/', 'node_modules/', '**/*.{js,mjs,cjs}', 'vitest.config.ts']
  },
  ...tsEslint.config(pluginJs.configs.recommended, {
    extends: [...tsEslint.configs.recommended],
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
      sonarjs
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    languageOptions: {
      globals: globals.node,
      parser: tsEslint.parser,
      parserOptions: {
        project: 'tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 2022
      }
    },
    rules: {
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
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],

      // ---- TIER 2: size proxies. Exemptible per shape, see overrides below. ----
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-len': [
        'warn',
        {
          code: 100,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignorePattern: ',^\\s*import\\s.+\\sfrom\\s.+;$'
        }
      ],

      // ---- Formatting ----
      semi: ['error', 'always'],
      quotes: [2, 'single', { avoidEscape: true }],
      indent: ['error', 'tab'],
      'object-curly-spacing': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'newline-before-return': 'error',
      'padding-line-between-statements': ['error', { blankLine: 'always', prev: 'const', next: 'if' }],

      // ---- Correctness / style ----
      'object-shorthand': ['error', 'always'],
      'dot-notation': 'error',
      curly: 'error',
      'constructor-super': 'error',
      'no-async-promise-executor': ['error'],
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  }),

  // Service factories: `createXService()` returns an object of N small methods over
  // its own closed-over state, so ESLint scores the whole factory as one long
  // function. Tier 1 still applies.
  {
    files: ['**/*.service.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off'
    }
  },

  // Session factories: `createXSessions()` returns an object of N small handlers
  // over its own closed-over run map — the same shape as the service factories
  // above. Tier 1 still applies.
  {
    files: ['src/*/session.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off'
    }
  },

  // Prompt catalog: length tracks the prose in its template literals, not
  // branching. Tier 1 still guards the interpolation logic.
  {
    files: ['src/prompts/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off'
    }
  },

  // Tests: arrange blocks repeat by design and fixtures run long.
  {
    files: ['**/*.test.ts'],
    rules: {
      'sonarjs/no-identical-functions': 'off',
      'max-nested-callbacks': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-len': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-conditional': 'off'
    }
  }
];
