import models from '../models';
import { Op } from 'sequelize';
import logger from '../util/logger';

export class StoryService {
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

  async getStoriesByIds(ids: readonly number[]) {
    const stories = await this.models.Story.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => stories.find((s) => s.id === id) || null);
  }

  async getChildrenByParentIds(parentIds: readonly number[]) {
    const stories = await this.models.Story.findAll({
      where: { fk_parent: { [Op.in]: [...parentIds] } },
      order: [['id', 'ASC']],
    });

    return parentIds.map((parentId) => stories.filter((story) => story.fk_parent === parentId));
  }

  async getReprintsByStoryIds(storyIds: readonly number[]) {
    const stories = await this.models.Story.findAll({
      where: { fk_reprint: { [Op.in]: [...storyIds] } },
      order: [['id', 'ASC']],
    });

    return storyIds.map((storyId) => stories.filter((story) => story.fk_reprint === storyId));
  }
}
