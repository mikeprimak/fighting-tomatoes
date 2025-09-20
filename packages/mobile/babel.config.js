module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // React Native Reanimated plugin (if you add animations later)
      // 'react-native-reanimated/plugin',
    ],
  };
};