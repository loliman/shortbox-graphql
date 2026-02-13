import { Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { UserInput } from '@shortbox/contract';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

type LoginRateLimitState = {
  failures: number;
  firstFailureAtMs: number;
  lockedUntilMs: number | null;
};

type PasswordVerificationResult = {
  valid: boolean;
  upgradePassword?: string;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export class LoginRateLimitError extends Error {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Zu viele Login-Versuche');
    this.name = 'LoginRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class UserService {
  private static readonly PASSWORD_PREFIX = 'scrypt';
  private static readonly SESSION_TTL_SECONDS = (() => {
    const parsed = parseInt(process.env.SESSION_TTL_SECONDS || '1209600', 10);
    return Number.isFinite(parsed) ? parsed : 1209600;
  })();
  private static readonly LOGIN_RATE_LIMIT_MAX_ATTEMPTS = parsePositiveInt(
    process.env.LOGIN_MAX_ATTEMPTS,
    8,
  );
  private static readonly LOGIN_RATE_LIMIT_WINDOW_SECONDS = parsePositiveInt(
    process.env.LOGIN_WINDOW_SECONDS,
    900,
  );
  private static readonly LOGIN_RATE_LIMIT_LOCK_SECONDS = parsePositiveInt(
    process.env.LOGIN_LOCK_SECONDS,
    900,
  );
  private static readonly loginRateLimitStateByKey = new Map<string, LoginRateLimitState>();

  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    if (level === 'error') {
      logger.error(message, { requestId: this.requestId });
      return;
    }
    if (level === 'warn') {
      logger.warn(message, { requestId: this.requestId });
      return;
    }
    logger.info(message, { requestId: this.requestId });
  }

  private generateSessionId(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sha256Hex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isSha256Hex(value: string): boolean {
    return /^[a-f0-9]{64}$/i.test(value);
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private buildSessionExpiry(reference = new Date()): Date {
    return new Date(reference.getTime() + UserService.SESSION_TTL_SECONDS * 1000);
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const hash = scryptSync(password, salt, 64).toString('base64url');
    return `${UserService.PASSWORD_PREFIX}$${salt}$${hash}`;
  }

  private verifyPassword(inputPassword: string, storedPassword: string): PasswordVerificationResult {
    if (storedPassword.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
      const [, salt, expectedHash] = storedPassword.split('$');
      if (!salt || !expectedHash) return { valid: false };

      const calculatedHash = scryptSync(inputPassword, salt, 64).toString('base64url');
      return {
        valid: this.safeEqual(expectedHash, calculatedHash),
      };
    }

    if (this.safeEqual(storedPassword, inputPassword)) {
      const legacyClientSentHash = this.isSha256Hex(storedPassword) && this.isSha256Hex(inputPassword);
      return {
        valid: true,
        upgradePassword: legacyClientSentHash ? undefined : inputPassword,
      };
    }

    if (this.isSha256Hex(storedPassword)) {
      const hashedInput = this.sha256Hex(inputPassword);
      if (this.safeEqual(storedPassword, hashedInput)) {
        return {
          valid: true,
          upgradePassword: inputPassword,
        };
      }
    }

    return { valid: false };
  }

  private buildLoginRateLimitKey(name: string, requestIp?: string): string {
    const normalizedName = name.trim().toLowerCase() || 'unknown';
    const normalizedIp = (requestIp || '').trim() || 'unknown';
    return `${normalizedName}|${normalizedIp}`;
  }

  private clearLoginRateLimit(key: string) {
    UserService.loginRateLimitStateByKey.delete(key);
  }

  private ensureLoginRateLimitNotExceeded(key: string, nowMs: number) {
    const state = UserService.loginRateLimitStateByKey.get(key);
    if (!state) return;

    if (state.lockedUntilMs && state.lockedUntilMs > nowMs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((state.lockedUntilMs - nowMs) / 1000));
      throw new LoginRateLimitError(retryAfterSeconds);
    }

    const windowMs = UserService.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000;
    if (nowMs - state.firstFailureAtMs > windowMs || (state.lockedUntilMs && state.lockedUntilMs <= nowMs)) {
      UserService.loginRateLimitStateByKey.delete(key);
    }
  }

  private registerLoginFailure(key: string, nowMs: number) {
    const windowMs = UserService.LOGIN_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const lockMs = UserService.LOGIN_RATE_LIMIT_LOCK_SECONDS * 1000;
    const current = UserService.loginRateLimitStateByKey.get(key);

    const state =
      !current || nowMs - current.firstFailureAtMs > windowMs
        ? { failures: 0, firstFailureAtMs: nowMs, lockedUntilMs: null }
        : current;

    state.failures += 1;
    if (state.failures >= UserService.LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
      state.failures = 0;
      state.firstFailureAtMs = nowMs;
      state.lockedUntilMs = nowMs + lockMs;
    }

    UserService.loginRateLimitStateByKey.set(key, state);
  }

  async login(user: UserInput, transaction: Transaction, requestIp?: string) {
    const name = (user.name || '').trim();
    this.log(`Login attempt for user: ${name || 'unknown'}`);
    const nowMs = Date.now();
    const loginRateLimitKey = this.buildLoginRateLimitKey(name, requestIp);

    try {
      this.ensureLoginRateLimitNotExceeded(loginRateLimitKey, nowMs);
    } catch (error) {
      if (error instanceof LoginRateLimitError) {
        this.log(
          `Login blocked by rate limiter for user: ${name || 'unknown'} (${error.retryAfterSeconds}s)`,
          'warn',
        );
      }
      throw error;
    }

    const sessionToken = this.generateSessionId();
    const sessionTokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = this.buildSessionExpiry();

    let userRecord = await this.models.User.findOne({
      where: { name },
      transaction,
    });

    if (!userRecord) {
      this.registerLoginFailure(loginRateLimitKey, nowMs);
      return null;
    }
    if (!user.password) {
      this.registerLoginFailure(loginRateLimitKey, nowMs);
      return null;
    }

    const passwordVerification = this.verifyPassword(user.password, userRecord.password);
    if (!passwordVerification.valid) {
      this.registerLoginFailure(loginRateLimitKey, nowMs);
      return null;
    }

    this.clearLoginRateLimit(loginRateLimitKey);

    if (
      !userRecord.password.startsWith(`${UserService.PASSWORD_PREFIX}$`) &&
      passwordVerification.upgradePassword
    ) {
      userRecord.password = this.hashPassword(passwordVerification.upgradePassword);
    }

    // One active session per user is enough for this single-admin setup.
    await this.models.UserSession.update(
      { revokedat: new Date() },
      { where: { fk_user: userRecord.id, revokedat: null }, transaction },
    );
    await this.models.UserSession.create(
      {
        fk_user: userRecord.id,
        tokenhash: sessionTokenHash,
        expiresat: expiresAt,
        revokedat: null,
      },
      { transaction },
    );
    await userRecord.save({ transaction });
    return { userRecord, sessionToken };
  }

  async logout(userId: number, sessionTokenHash: string, transaction: Transaction) {
    this.log(`Logout for user ID: ${userId}`);
    let [affectedCount] = await this.models.UserSession.update(
      { revokedat: new Date() },
      {
        where: {
          fk_user: userId,
          tokenhash: sessionTokenHash,
          revokedat: null,
          expiresat: { [Op.gt]: new Date() },
        },
        transaction,
      },
    );
    return affectedCount !== 0;
  }
}
