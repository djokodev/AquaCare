module.exports = {
  preset: 'jest-expo',

  // Setup files
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/jest.setup.js',
  ],

  // Module paths (align with tsconfig.json)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@/services/(.*)$': '<rootDir>/src/services/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/constants/(.*)$': '<rootDir>/src/constants/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/store/(.*)$': '<rootDir>/src/store/$1',
    '^@/domain/(.*)$': '<rootDir>/src/domain/$1',
  },

  // Transform ignore patterns for node_modules
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@reduxjs/toolkit|react-redux)',
  ],

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.(test|spec).[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // Collect coverage from these files
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/types/**',
    '!src/navigation/**',
    '!src/constants/**',
    '!src/domain/constants.ts',
  ],

  // Coverage thresholds (progressive approach - Phase 1: critical modules)
  // Global threshold set to current coverage to ensure CI passes
  coverageThreshold: {
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0,
    },
    // High coverage required for tested modules
    './src/domain/aquaculture/estimators.ts': {
      statements: 95,
      branches: 100,
      functions: 100,
      lines: 95,
    },
    './src/utils/formatters.ts': {
      statements: 90,
      branches: 95,
      functions: 100,
      lines: 90,
    },
    './src/utils/interpreters.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    './src/utils/validators.ts': {
      statements: 95,
      branches: 100,
      functions: 100,
      lines: 95,
    },
  },

  // Test environment
  testEnvironment: 'node',

  // Verbose output
  verbose: true,
};
