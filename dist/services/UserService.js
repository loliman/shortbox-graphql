"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const logger_1 = __importDefault(require("../util/logger"));
const crypto_1 = require("crypto");
class UserService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        if (level === 'error') {
            logger_1.default.error(message, { requestId: this.requestId });
            return;
        }
        if (level === 'warn') {
            logger_1.default.warn(message, { requestId: this.requestId });
            return;
        }
        logger_1.default.info(message, { requestId: this.requestId });
    }
    generateSessionId() {
        return (0, crypto_1.randomBytes)(48).toString('base64url');
    }
    hashPassword(password) {
        const salt = (0, crypto_1.randomBytes)(16).toString('base64url');
        const hash = (0, crypto_1.scryptSync)(password, salt, 64).toString('base64url');
        return `${UserService.PASSWORD_PREFIX}$${salt}$${hash}`;
    }
    verifyPassword(inputPassword, storedPassword) {
        if (storedPassword.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
            const [, salt, expectedHash] = storedPassword.split('$');
            if (!salt || !expectedHash)
                return false;
            const calculatedHash = (0, crypto_1.scryptSync)(inputPassword, salt, 64).toString('base64url');
            const expectedBuffer = Buffer.from(expectedHash);
            const actualBuffer = Buffer.from(calculatedHash);
            if (expectedBuffer.length !== actualBuffer.length)
                return false;
            return (0, crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer);
        }
        const expectedBuffer = Buffer.from(storedPassword);
        const actualBuffer = Buffer.from(inputPassword);
        if (expectedBuffer.length !== actualBuffer.length)
            return false;
        return (0, crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer);
    }
    async login(user, transaction) {
        this.log(`Login attempt for user: ${user.name}`);
        const sessionid = this.generateSessionId();
        let userRecord = await this.models.User.findOne({
            where: { name: (user.name || '').trim() },
            transaction,
        });
        if (!userRecord)
            return null;
        if (!user.password || !this.verifyPassword(user.password, userRecord.password))
            return null;
        if (!userRecord.password.startsWith(`${UserService.PASSWORD_PREFIX}$`)) {
            userRecord.password = this.hashPassword(user.password);
        }
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
UserService.PASSWORD_PREFIX = 'scrypt';
