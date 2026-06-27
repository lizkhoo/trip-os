module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // Inline Drizzle's .sql migration files as strings (import m from './x.sql')
    // instead of letting Metro parse them as JS. Pairs with sourceExts 'sql' in metro.config.js.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
