const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add support for additional file extensions
config.resolver.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];

// Polyfill Node.js modules for browser
config.resolver.extraNodeModules = {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
};

// MWA (Mobile Wallet Adapter) packages are pure JavaScript - they use React Native's Linking API
// to communicate with wallet apps via Android intents. No native module substitution needed.
// The stub is no longer required since the real packages work in all environments.
console.log('[Metro] Using real MWA packages (pure JavaScript, no native module needed)');

module.exports = config;
