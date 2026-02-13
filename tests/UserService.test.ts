import { UserService } from '../src/services/UserService';
import { randomBytes, scryptSync } from 'crypto';

describe('UserService', () => {
  let userService: UserService;
  let mockModels: any;
  let mockTransaction: any;

  beforeEach(() => {
    mockModels = {
      User: {
        findOne: jest.fn(),
        update: jest.fn(),
      },
    };

    mockTransaction = {};
    userService = new UserService(mockModels);
  });

  it('persists user record on successful login', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const password = 'secret';
    const salt = randomBytes(16).toString('base64url');
    const hash = scryptSync(password, salt, 64).toString('base64url');
    const userRecord = {
      id: 1,
      name: 'alice',
      password: `scrypt$${salt}$${hash}`,
      sessionid: null,
      save,
    };

    mockModels.User.findOne.mockResolvedValue(userRecord);

    const input = { name: ' alice ', password: 'secret' } as any;
    const result = await userService.login(input, mockTransaction);

    expect(mockModels.User.findOne).toHaveBeenCalledWith({
      where: { name: 'alice' },
      transaction: mockTransaction,
    });
    expect(result).toBe(userRecord);
    expect(save).toHaveBeenCalledWith({ transaction: mockTransaction });
    expect(userRecord.sessionid).toBeNull();
  });

  it('returns null and does not persist when login fails', async () => {
    mockModels.User.findOne.mockResolvedValue(null);

    const input = { name: 'alice', password: 'wrong' } as any;
    const result = await userService.login(input, mockTransaction);

    expect(result).toBeNull();
    expect(mockModels.User.findOne).toHaveBeenCalledWith({
      where: { name: 'alice' },
      transaction: mockTransaction,
    });
  });

  it('returns null when password does not match hash', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const salt = randomBytes(16).toString('base64url');
    const hash = scryptSync('secret', salt, 64).toString('base64url');
    const userRecord = {
      id: 1,
      name: 'alice',
      password: `scrypt$${salt}$${hash}`,
      sessionid: null,
      save,
    };
    mockModels.User.findOne.mockResolvedValue(userRecord);

    const result = await userService.login({ name: 'alice', password: 'wrong' } as any, mockTransaction);

    expect(result).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('upgrades legacy plaintext password to scrypt hash on successful login', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const userRecord = {
      id: 1,
      name: 'alice',
      password: 'secret',
      sessionid: null,
      save,
    };
    mockModels.User.findOne.mockResolvedValue(userRecord);

    const result = await userService.login({ name: 'alice', password: 'secret' } as any, mockTransaction);

    expect(result).toBe(userRecord);
    expect(userRecord.password.startsWith('scrypt$')).toBe(true);
    expect(save).toHaveBeenCalledWith({ transaction: mockTransaction });
  });

  it('returns true on logout without database write', async () => {
    const result = await userService.logout(1, mockTransaction);

    expect(result).toBe(true);
    expect(mockModels.User.update).not.toHaveBeenCalled();
  });
});
