import { Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { UserInput } from '@shortbox/contract';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export class UserService {
  private static readonly PASSWORD_PREFIX = 'scrypt';
  private static readonly SESSION_TTL_SECONDS = (() => {
    const parsed = parseInt(process.env.SESSION_TTL_SECONDS || '1209600', 10);
    return Number.isFinite(parsed) ? parsed : 1209600;
  })();

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

  private buildSessionExpiry(reference = new Date()): Date {
    return new Date(reference.getTime() + UserService.SESSION_TTL_SECONDS * 1000);
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('base64url');
    const hash = scryptSync(password, salt, 64).toString('base64url');
    return `${UserService.PASSWORD_PREFIX}$${salt}$${hash}`;
  }

  private verifyPassword(inputPassword: string, storedPassword: string): boolean {
    if (storedPassword.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
      const [, salt, expectedHash] = storedPassword.split('$');
      if (!salt || !expectedHash) return false;

      const calculatedHash = scryptSync(inputPassword, salt, 64).toString('base64url');
      const expectedBuffer = Buffer.from(expectedHash);
      const actualBuffer = Buffer.from(calculatedHash);

      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    }

    const expectedBuffer = Buffer.from(storedPassword);
    const actualBuffer = Buffer.from(inputPassword);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }

  async login(user: UserInput, transaction: Transaction) {
    this.log(`Login attempt for user: ${user.name}`);
    const sessionToken = this.generateSessionId();
    const sessionTokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = this.buildSessionExpiry();

    let userRecord = await this.models.User.findOne({
      where: { name: (user.name || '').trim() },
      transaction,
    });

    if (!userRecord) return null;
    if (!user.password || !this.verifyPassword(user.password, userRecord.password)) return null;

    if (!userRecord.password.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
      userRecord.password = this.hashPassword(user.password);
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
