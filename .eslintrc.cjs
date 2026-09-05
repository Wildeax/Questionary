module.exports = {
  root: true,
  env: { browser: true, node: true, es2020: true },
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'postcss.config.cjs', 'tailwind.config.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  overrides: [
    {
      // tsc already reports undefined names and unused locals for TypeScript files.
      files: ['*.ts', '*.tsx'],
      rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
    },
  ],
}
