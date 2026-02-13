const base = require('./jest.config.base');

module.exports = {
  ...base,
  testMatch: ['**/tests/**/*.integration.test.ts'],
  maxWorkers: 1,
  globalTeardown: '<rootDir>/tests/integration/teardown.ts',
};
