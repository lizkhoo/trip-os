const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'src/db/migrations/**',
      'seed/**',
    ],
  },
  {
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      // async-IIFE-style fetches inside useEffect are standard; rule is over-aggressive.
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },
];
