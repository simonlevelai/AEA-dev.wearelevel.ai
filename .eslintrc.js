module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  env: {
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    // Safety-critical rules for health service
    'no-unused-vars': 'error',
    'no-console': 'off', // Allow console for health service logging
    'prefer-const': 'error',
    'no-var': 'error',
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    '**/*.js',
    'deploy/',
    'infrastructure/',
    'monitoring/',
  ],
};