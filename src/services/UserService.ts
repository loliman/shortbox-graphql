import models from '../models';
import { Transaction } from 'sequelize';
import logger from '../util/logger';
import type { UserInput } from '@shortbox/contract';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export class UserService {
  private static readonly PASSWORD_PREFIX = 'scrypt';

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
    const sessionid = this.generateSessionId();

    let userRecord = await this.models.User.findOne({
      where: { name: (user.name || '').trim() },
      transaction,
    });

    if (!userRecord) return null;
    if (!user.password || !this.verifyPassword(user.password, userRecord.password)) return null;

    if (!userRecord.password.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
      userRecord.password = this.hashPassword(user.password);
    }

    userRecord.sessionid = sessionid;
    await userRecord.save({ transaction });
    return userRecord;
  }

  async logout(userId: number, sessionid: string, transaction: Transaction) {
    this.log(`Logout for user ID: ${userId}`);
    let [affectedCount] = await this.models.User.update(
      { sessionid: null },
      { where: { id: userId, sessionid }, transaction },
    );
    return affectedCount !== 0;
  }
}
