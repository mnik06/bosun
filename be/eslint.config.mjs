import globals from 'globals';
import pluginJs from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import sonarjs from 'eslint-plugin-sonarjs';
import tsEslint from 'typescript-eslint';

/**
 * Layered architecture, mechanically enforced. See CLAUDE.md § Layered Architecture
 * and agent-docs/controllers.md. Dependencies flow one way only:
 *
 *   route -> controller -> repo -> db
 *
 * `api/routes/schemas` and `api/errors` are declaration layers that merely live under
 * `api/`; every layer may import them. The one-way ban is about routes and repos: a repo
 * never reaches back up into a controller or a route, and a route never reaches past its
 * controller into a repo.
 */
const BE_ELEMENTS = [
  { type: 'route-schema', pattern: 'src/api/routes/schemas', partialMatch: false },
  { type: 'route', pattern: 'src/api/routes', partialMatch: false },
  { type: 'errors', pattern: 'src/api/errors', partialMatch: false },
  { type: 'api-infra', pattern: 'src/api', partialMatch: false },
  { type: 'controller', pattern: 'src/controllers/*', capture: ['domain'], partialMatch: false },
  { type: 'repo', pattern: 'src/repos', partialMatch: false },
  { type: 'service', pattern: 'src/services/*', capture: ['service'], partialMatch: false },
  { type: 'util', pattern: 'src/utils', partialMatch: false },
  { type: 'domain-type', pattern: 'src/types', partialMatch: false }
];

const DECLARATIVE = ['domain-type', 'util', 'errors'];

const BE_POLICIES = [
  // `HttpError` is a declaration, not a dependency: a lookup helper may throw the 404 itself.
  { from: { element: { type: 'util' } }, allow: { to: { element: { type: ['util', 'errors'] } } } },
  {
    from: { element: { type: 'route-schema' } },
    allow: { to: { element: { type: [...DECLARATIVE, 'service'] } } }
  },
  { from: { element: { type: 'errors' } }, allow: { to: { element: { type: [...DECLARATIVE, 'service'] } } } },
  {
    from: { element: { type: 'domain-type' } },
    allow: { to: { element: { type: [...DECLARATIVE, 'service', 'repo'] } } }
  },
  { from: { element: { type: 'repo' } }, allow: { to: { element: { type: [...DECLARATIVE, 'service'] } } } },
  {
    from: { element: { type: 'service' } },
    allow: { to: { element: { type: [...DECLARATIVE, 'service', 'repo'] } } }
  },
  {
    from: { element: { type: 'controller' } },
    allow: {
      to: { element: { type: [...DECLARATIVE, 'service', 'repo', 'route-schema', 'controller'] } }
    }
  },
  {
    from: { element: { type: 'route' } },
    allow: {
      to: {
        element: { type: [...DECLARATIVE, 'service', 'controller', 'route-schema', 'api-infra'] }
      }
    }
  },
  { from: { element: { type: 'api-infra' } }, allow: { to: { element: { type: '*' } } } }
];

/**
 * Two-tier lint policy.
 *
 * TIER 1 — complexity rules. They measure logic, so they are shape-independent
 * and are never switched off for production code. If one of these fires, the
 * code is genuinely too complex and must be refactored.
 *
 * TIER 2 — size rules (max-lines, max-lines-per-function, max-len). These are
 * only proxies for complexity. Where the proxy structurally mismeasures a shape
 * (a repo factory that returns an object of N small methods, a declaration
 * catalog whose length tracks its table count) the size rule is switched off
 * for that shape below — Tier 1 still guards it.
 *
 * Exemptions are granted two ways, and no other way:
 *   - a recurring shape  -> a glob in this file, with the reason stated
 *   - a one-off          -> `// eslint-disable-next-line <rule> -- <reason>`
 * `reportUnusedDisableDirectives` keeps the second kind from going stale.
 */
export default [
  {
    ignores: ['dist/', 'node_modules/', 'drizzle-out/', '**/*.{js,mjs,cjs}']
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

  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': BE_ELEMENTS,
      'import/resolver': {
        typescript: { alwaysTryTypes: true, project: './tsconfig.json' }
      }
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: BE_POLICIES }]
    }
  },

  // Repo factories: `getXRepo(db)` returns an object of N small methods, so
  // ESLint scores the whole factory as one long function. Tier 1 still applies,
  // so a genuinely gnarly query method is still reported.
  {
    files: ['**/*.repo.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off'
    }
  },

  // Service factories: `getXService()` returns an object of N small methods over
  // its own closed-over state, so ESLint scores the whole factory as one long
  // function. Same shape as the repo factories above; Tier 1 still applies.
  {
    files: ['**/*.service.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off'
    }
  },

  // Declaration catalog: length tracks the number of tables/columns declared,
  // not branching. No executable logic to simplify.
  {
    files: ['src/services/drizzle/schema.ts'],
    rules: {
      'max-lines': 'off'
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
