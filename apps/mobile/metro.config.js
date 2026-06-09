// Metro config for a pnpm monorepo — adapted from Expo's "Work with monorepos"
// guide: https://docs.expo.dev/guides/monorepos/
//
// Two things matter for this to resolve the @pg/* workspace packages:
//   1. watchFolders includes the repo root, so Metro watches packages/* sources
//      (e.g. @pg/api-client ships TS source — Metro transpiles it on the fly).
//   2. nodeModulesPaths lists both the app's and the root's node_modules.
//
// NOTE on pnpm: the guide sets `disableHierarchicalLookup = true`, but that is
// for npm/yarn flat hoisting. pnpm nests each package's own deps under a
// symlinked `.pnpm/<pkg>/node_modules`, so Metro MUST keep hierarchical lookup
// on (walk the symlink chain) or `expo` can't find `expo-modules-core`, etc.
// Symlink resolution is on by default in current Metro.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
