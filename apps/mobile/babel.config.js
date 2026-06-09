// NativeWind v4 needs babel-preset-expo with the nativewind jsxImportSource plus
// the nativewind/babel preset. babel-preset-expo auto-adds the reanimated/worklets
// plugin when those packages are installed.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
