"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StoryService = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = __importDefault(require("../util/logger"));
class StoryService {
    constructor(models, requestId) {
        this.models = models;
        this.requestId = requestId;
    }
    log(message, level = 'info') {
        logger_1.default[level](message, { requestId: this.requestId });
    }
    async getStoriesByIds(ids) {
        const stories = await this.models.Story.findAll({
            where: { id: { [sequelize_1.Op.in]: [...ids] } },
        });
        return ids.map((id) => stories.find((s) => s.id === id) || null);
    }
}
exports.StoryService = StoryService;
