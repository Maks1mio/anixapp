/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-recommended-scss'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist*/**',
    '**/release/**',
    '**/android*/**',
    '**/public/**',
  ],
  overrides: [
    {
      files: ['**/*.svelte'],
      customSyntax: 'postcss-html',
    },
  ],
  rules: {
    // Крупный legacy SCSS — фокус на реальных багах, не на стилистике
    'selector-class-pattern': null,
    'no-descending-specificity': null,
    'no-duplicate-selectors': null,
    'declaration-block-no-shorthand-property-overrides': null,
    'scss/operator-no-newline-after': null,
    'scss/operator-no-newline-before': null,
    'scss/operator-no-unspaced': null,
    'scss/at-extend-no-missing-placeholder': null,
    'scss/comment-no-empty': null,
    'scss/load-no-partial-leading-underscore': null,
    'scss/at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'use', 'forward', 'include', 'mixin', 'function', 'return',
          'if', 'else', 'each', 'for', 'while', 'extend', 'error', 'warn',
        ],
      },
    ],
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global', 'local'],
      },
    ],
    'function-no-unknown': [
      true,
      {
        ignoreFunctions: ['color-mix', 'oklch', 'oklab'],
      },
    ],
  },
};
