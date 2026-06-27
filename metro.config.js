const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Drizzle ships migrations as .sql files imported as modules
// (src/db/migrations/migrations.js). Metro must treat .sql as source.
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
