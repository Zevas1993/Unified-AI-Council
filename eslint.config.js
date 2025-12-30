const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.config.js']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': 'off'
    }
  },
  {
    // Test files don't need strict project parsing
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    // Shell script generation uses intentional escape sequences
    files: ['src/cli/wslCliRunner.ts'],
    rules: {
      'no-useless-escape': 'off'
    }
  },
  {
    // Command validation uses intentional escape patterns for regex
    files: ['src/security/commandValidation.ts'],
    rules: {
      'no-useless-escape': 'off'
    }
  }
);
