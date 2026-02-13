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
    async getStoriesByIds(ids) {
        const stories = await this.models.Story.findAll({
            where: { id: { [sequelize_1.Op.in]: [...ids] } },
        });
        return ids.map((id) => stories.find((s) => s.id === id) || null);
    }
    async getChildrenByParentIds(parentIds) {
        const stories = await this.models.Story.findAll({
            where: { fk_parent: { [sequelize_1.Op.in]: [...parentIds] } },
            order: [['id', 'ASC']],
        });
        return parentIds.map((parentId) => stories.filter((story) => story.fk_parent === parentId));
    }
    async getReprintsByStoryIds(storyIds) {
        const stories = await this.models.Story.findAll({
            where: { fk_reprint: { [sequelize_1.Op.in]: [...storyIds] } },
            order: [['id', 'ASC']],
        });
        return storyIds.map((storyId) => stories.filter((story) => story.fk_reprint === storyId));
    }
}
exports.StoryService = StoryService;
