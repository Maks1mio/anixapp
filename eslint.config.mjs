import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { fileURLToPath } from 'node:url';
import globals from 'globals';
import svelte from 'eslint-plugin-svelte';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import svelteConfig from './svelte.config.mjs';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/**
 * ESLint flat config — Svelte 5 + TypeScript + Electron.
 *
 * @typescript-eslint/* напрямую (не umbrella): umbrella падает на TS 7.
 * Рядом с parser/plugin лежит TS 5.9 — scripts/ensure-eslint-typescript.js.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  includeIgnoreFile(gitignorePath),
  {
    ignores: [
      'android/**',
      'android-mobile/**',
      'public/**',
      'release/**',
      'dist*/**',
      'scripts/**',
      '**/*.worklet.js',
      '**/*.min.js',
      'electron/**/*.html',
    ],
  },
  js.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Типы DOM/WebGPU проверяет TypeScript, не ESLint
      'no-undef': 'off',
      'no-control-regex': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
        parser: tsParser,
        svelteConfig,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-undef': 'off', // browser/DOM types через globals + TS
      'svelte/no-at-html-tags': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/require-each-key': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['electron/**/*.{js,cjs,mjs}'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
