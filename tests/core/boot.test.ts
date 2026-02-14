const mockAuthenticate = jest.fn();
const mockCleanupStart = jest.fn();
const mockMigratorUp = jest.fn();
const mockLoggerInfo = jest.fn();

jest.mock('../../src/core/database', () => ({
  __esModule: true,
  default: { authenticate: mockAuthenticate },
}));

jest.mock('../../src/core/cleanup', () => ({
  cleanup: { start: mockCleanupStart },
}));

jest.mock('../../src/core/migrations', () => ({
  migrator: { up: mockMigratorUp },
}));

jest.mock('../../src/util/logger', () => ({
  __esModule: true,
  default: { info: mockLoggerInfo },
}));

import { boot } from '../../src/boot';

describe('boot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue(undefined);
  });

  it('runs startup flow when no migrations are pending', async () => {
    mockMigratorUp.mockResolvedValue([]);
    const processFn = jest.fn().mockResolvedValue(undefined);

    await boot(processFn);

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockMigratorUp).toHaveBeenCalledTimes(1);
    expect(mockCleanupStart).toHaveBeenCalledTimes(1);
    expect(processFn).toHaveBeenCalledTimes(1);
    expect(
      mockLoggerInfo.mock.calls.some((call) => String(call[0]).includes('schema is up to date')),
    ).toBe(true);
  });

  it('logs applied migrations when migration list is non-empty', async () => {
    mockMigratorUp.mockResolvedValue([{ name: '001_init' }, { name: '002_users' }]);
    const processFn = jest.fn().mockResolvedValue(undefined);

    await boot(processFn);

    expect(
      mockLoggerInfo.mock.calls.some((call) => String(call[0]).includes('Applied migration 001_init')),
    ).toBe(true);
    expect(
      mockLoggerInfo.mock.calls.some((call) => String(call[0]).includes('Applied migration 002_users')),
    ).toBe(true);
  });
});

