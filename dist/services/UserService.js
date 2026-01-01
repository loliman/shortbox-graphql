"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const logger_1 = __importDefault(require("../util/logger"));
class UserService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        logger_1.default[level](message, { requestId: this.requestId });
    }
    async login(user, transaction) {
        this.log(`Login attempt for user: ${user.name}`);
        let sessionid = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 64; i++)
            sessionid += possible.charAt(Math.floor(Math.random() * possible.length));
        let userRecord = await this.models.User.findOne({
            where: { name: (user.name || '').trim(), password: user.password },
            transaction,
        });
        if (!userRecord)
            return null;
        userRecord.sessionid = sessionid;
        await userRecord.save({ transaction });
        return userRecord;
    }
    async logout(user, transaction) {
        this.log(`Logout for user ID: ${user.id}`);
        let [affectedCount] = await this.models.User.update({ sessionid: null }, { where: { id: user.id, sessionid: user.sessionid }, transaction });
        return affectedCount !== 0;
    }
}
exports.UserService = UserService;
