const base = require('./jest.config.base');

module.exports = {
  ...base,
  testMatch: ['**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['\\.integration\\.test\\.ts$'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/core/cookies.ts',
    'src/core/cursor.ts',
    'src/core/server-config.ts',
    'src/core/server-request.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
