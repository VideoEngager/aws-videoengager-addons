// eslint.config.js (for ESLint v9+ flat config)

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Ignore patterns (first in array)
  {
    ignores: [
      '**/bundle.js',
      '**/dist/**',
      '**/build/**', 
      '**/node_modules/**',
      '**/coverage/**',
      '**/setupTests.js',
      '**/testUtils/**'
    ]
  },
  
  // Base configuration for all JS files
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn', 
      'eqeqeq': 'warn',
      'curly': 'warn'
    }
  },
  
  // Test files configuration
  {
    files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}', '**/*test*.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
        expect: 'readonly',
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    },
    rules: {
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off'
    }
  },
  
  // Lambda .mjs files - stricter rules
  {
    files: ['src/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'prefer-const': 'error',
      'eqeqeq': 'error', 
      'curly': 'error'
    }
  }
];