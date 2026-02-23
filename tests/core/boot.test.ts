const mockAuthenticate = jest.fn();
const mockLoggerInfo = jest.fn();
const mockSync = jest.fn();

jest.mock('../../src/core/database', () => ({
  __esModule: true,
  default: { authenticate: mockAuthenticate },
}));

jest.mock('../../src/models', () => ({
  __esModule: true,
  default: {
    sequelize: {
      sync: mockSync,
    },
  },
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
    mockSync.mockResolvedValue(undefined);
  });

  it('runs startup flow', async () => {
    const processFn = jest.fn().mockResolvedValue(undefined);

    await boot(processFn);

    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledTimes(0);
    expect(processFn).toHaveBeenCalledTimes(1);
  });
});
