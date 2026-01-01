import models from '../models';
import { Transaction } from 'sequelize';
import logger from '../util/logger';
import { UserInput } from '../types/graphql';

export class UserService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  async login(user: UserInput, transaction: Transaction) {
    this.log(`Login attempt for user: ${user.name}`);
    let sessionid = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i++)
      sessionid += possible.charAt(Math.floor(Math.random() * possible.length));

    let userRecord = await this.models.User.findOne({
      where: { name: (user.name || '').trim(), password: user.password },
      transaction,
    });

    if (!userRecord) return null;

    userRecord.sessionid = sessionid;
    await userRecord.save({ transaction });
    return userRecord;
  }

  async logout(user: UserInput, transaction: Transaction) {
    this.log(`Logout for user ID: ${user.id}`);
    let [affectedCount] = await this.models.User.update(
      { sessionid: null },
      { where: { id: user.id, sessionid: user.sessionid }, transaction },
    );
    return affectedCount !== 0;
  }
}
