module.exports = function () {
  const preset = require('nativewind/babel')();
  preset.plugins = preset.plugins.filter(
    (plugin) => plugin !== 'react-native-worklets/plugin'
  );
  return preset;
};
