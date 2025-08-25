const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
  '@/components': path.resolve(__dirname, 'src/components'),
  '@/screens': path.resolve(__dirname, 'src/screens'),
  '@/services': path.resolve(__dirname, 'src/services'),
  '@/hooks': path.resolve(__dirname, 'src/hooks'),
  '@/utils': path.resolve(__dirname, 'src/utils'),
  '@/constants': path.resolve(__dirname, 'src/constants'),
  '@/types': path.resolve(__dirname, 'src/types'),
};

module.exports = config;