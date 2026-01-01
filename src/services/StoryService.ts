import models from '../models';
import { Op } from 'sequelize';
import logger from '../util/logger';

export class StoryService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  async getStoriesByIds(ids: readonly number[]) {
    const stories = await this.models.Story.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => stories.find((s) => s.id === id) || null);
  }
}
