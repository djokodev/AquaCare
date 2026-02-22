const base = require('./jest.config');

module.exports = {
  ...base,
  collectCoverageFrom: [
    'src/features/commerce/**/*.{ts,tsx}',
    'src/domain/commerce/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
  ],
  // Dedicated module audit: avoid global threshold false negatives.
  coverageThreshold: undefined,
};
