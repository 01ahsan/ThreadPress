import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Rule 3: no dynamic code execution, ever.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': ['error', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'No network requests.' },
        { object: 'document', property: 'cookie', message: 'Never read cookies.' },
        { object: 'window', property: 'localStorage', message: 'Do not touch site storage.' },
        { object: 'window', property: 'sessionStorage', message: 'Do not touch site storage.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Build DOM nodes; never assign HTML strings.',
        },
        {
          selector:
            'CallExpression[callee.property.name=/^(insertAdjacentHTML|parseFromString|write|writeln)$/]',
          message: 'Never parse or write HTML strings.',
        },
        { selector: "Identifier[name='localStorage']", message: 'Do not touch site storage.' },
        { selector: "Identifier[name='sessionStorage']", message: 'Do not touch site storage.' },
      ],
    },
  },
  {
    files: ['scripts/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-properties': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
