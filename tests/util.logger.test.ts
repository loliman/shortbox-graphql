describe('logger module', () => {
  const originalLogToFiles = process.env.LOG_TO_FILES;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalLogToFiles === undefined) delete process.env.LOG_TO_FILES;
    else process.env.LOG_TO_FILES = originalLogToFiles;

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('creates console logger by default', () => {
    jest.resetModules();
    process.env.LOG_TO_FILES = 'false';
    process.env.NODE_ENV = 'test';

    const logger = require('../src/util/logger').default;
    expect(logger).toBeDefined();
    expect(Array.isArray(logger.transports)).toBe(true);
    expect(logger.transports.length).toBeGreaterThan(0);
  });

  it('adds file transports when LOG_TO_FILES is enabled', () => {
    jest.resetModules();
    process.env.LOG_TO_FILES = 'true';
    process.env.NODE_ENV = 'production';

    const logger = require('../src/util/logger').default;
    expect(logger.transports.length).toBeGreaterThanOrEqual(3);
  });
});

