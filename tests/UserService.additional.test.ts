import { createHash } from 'crypto';
import logger from '../src/util/logger';
import { LoginRateLimitError, UserService } from '../src/services/UserService';

describe('UserService additional coverage', () => {
  let userService: UserService;
  let mockModels: any;
  let limiter: any;
  const tx = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockModels = {
      User: {
        findOne: jest.fn(),
      },
    };
    userService = new UserService(mockModels, 'req-2');
    limiter = (UserService as any).loginRateLimiter;
    jest.spyOn(limiter, 'get').mockResolvedValue(null);
    jest.spyOn(limiter, 'consume').mockResolvedValue({ remainingPoints: 7, msBeforeNext: 0 } as any);
    jest.spyOn(limiter, 'delete').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes LoginRateLimitError metadata', () => {
    const error = new LoginRateLimitError(9);
    expect(error.name).toBe('LoginRateLimitError');
    expect(error.retryAfterSeconds).toBe(9);
  });

  it('returns null when user exists without password and records failed attempt', async () => {
    mockModels.User.findOne.mockResolvedValue({ id: 1, name: 'alice', save: jest.fn() });

    const result = await userService.login({ name: 'alice', password: '' } as any, tx, '1.2.3.4');

    expect(result).toBeNull();
    expect(limiter.consume).toHaveBeenCalledWith('alice|1.2.3.4', 1);
  });

  it('accepts legacy sha256 hash and upgrades to scrypt', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const storedPassword = createHash('sha256').update('secret').digest('hex');
    const userRecord = { id: 1, name: 'alice', password: storedPassword, save };
    mockModels.User.findOne.mockResolvedValue(userRecord);

    const result = await userService.login({ name: 'alice', password: 'secret' } as any, tx);

    expect(result).toBe(userRecord);
    expect(userRecord.password.startsWith('scrypt$')).toBe(true);
    expect(save).toHaveBeenCalledWith({ transaction: tx });
    expect(limiter.delete).toHaveBeenCalled();
  });

  it('throws LoginRateLimitError when already blocked before lookup', async () => {
    jest.spyOn(limiter, 'get').mockResolvedValue({ remainingPoints: 0, msBeforeNext: 2500 });
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);

    await expect(userService.login({ name: 'alice', password: 'x' } as any, tx)).rejects.toThrow(
      LoginRateLimitError,
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it('translates limiter consume state to LoginRateLimitError', async () => {
    mockModels.User.findOne.mockResolvedValue(null);
    jest.spyOn(limiter, 'consume').mockRejectedValue({
      remainingPoints: 0,
      msBeforeNext: 1500,
    });

    await expect(userService.login({ name: 'alice', password: 'x' } as any, tx)).rejects.toMatchObject(
      { retryAfterSeconds: 2 },
    );
  });

  it('rethrows unknown consume errors', async () => {
    mockModels.User.findOne.mockResolvedValue(null);
    const boom = new Error('boom');
    jest.spyOn(limiter, 'consume').mockRejectedValue(boom);

    await expect(userService.login({ name: 'alice', password: 'x' } as any, tx)).rejects.toThrow(
      'boom',
    );
  });

  it('covers private helper branches for logging and limiter parsing', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger as any);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);

    (userService as any).log('warn', 'warn');
    (userService as any).log('err', 'error');
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    expect((userService as any).toRetryAfterSeconds(undefined)).toBe(1);
    expect((userService as any).toRetryAfterSeconds(0)).toBe(1);
    expect((userService as any).asRateLimiterRes('x')).toBeNull();
    expect((userService as any).asRateLimiterRes({})).toBeNull();
    expect((userService as any).asRateLimiterRes({ remainingPoints: 0, msBeforeNext: 1 })).toEqual({
      remainingPoints: 0,
      msBeforeNext: 1,
    });
  });
});

