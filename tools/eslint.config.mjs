import globals from 'globals';
export default [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-const-assign': 'error', 'no-dupe-keys': 'error', 'no-import-assign': 'error' },
}];
