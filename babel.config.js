// Mirrors Expo SDK 56's default Babel config so Jest (jest-expo) can transform
// TypeScript/JSX. Metro reads the same preset; the React Compiler experiment is
// driven by app.json and honored by babel-preset-expo.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
