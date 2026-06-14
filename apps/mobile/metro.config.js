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

// watchFolders is the whole monorepo root (above), so Metro reacts to file
// changes ANYWHERE in the repo — including sibling apps' build output. Running
// the API in watch mode (`pnpm --filter @pg/api dev`) rewrites apps/api/dist on
// every recompile, which otherwise makes Metro re-bundle in a loop (the
// "Refreshing…" banner flashes on the phone every 1-2s). The mobile app imports
// nothing from apps/* — only packages/* (e.g. @pg/shared's dist, @pg/api-client's
// src) — so excluding the sibling app trees + turbo cache is safe. Append to the
// default blockList (don't replace it).
config.resolver.blockList = [
  ...config.resolver.blockList,
  /[/\\]apps[/\\]api[/\\].*/,
  /[/\\]apps[/\\]admin[/\\].*/,
  /[/\\]\.turbo[/\\].*/,
];

module.exports = withNativeWind(config, { input: './global.css' });
