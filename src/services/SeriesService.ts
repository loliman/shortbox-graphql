import models from '../models';
import { FindOptions, Op, Sequelize, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, PublisherInput, SeriesInput } from '@shortbox/contract';
import { buildConnectionFromNodes, decodeCursorId } from '../core/cursor';

export class SeriesService {
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

  async findSeries(
    pattern: string | undefined,
    publisher: PublisherInput,
    first: number | undefined,
    after: string | undefined,
    loggedIn: boolean,
    filter: Filter | undefined,
  ) {
    type WhereMap = Record<string | symbol, unknown>;
    type IssueWithSeries = {
      Series: {
        id: number;
        title: string;
        volume: number;
        startyear: number;
        endyear: number;
        fk_publisher: number;
      };
    };
    const limit = first || 50;
    const decodedCursor = decodeCursorId(after || undefined);

    if (!filter) {
      const where: WhereMap = {};
      let options: FindOptions = {
        order: [
          [Sequelize.fn('sortabletitle', Sequelize.col('title')), 'ASC'],
          ['volume', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [{ model: this.models.Publisher }],
        where,
        limit: limit + 1,
      };

      if (decodedCursor) {
        where[Op.and] = [
          Sequelize.literal(
            `(sortabletitle(title), volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`,
          ),
        ];
      }

      if (publisher.name !== '*')
        options.where = { ...options.where, '$Publisher.name$': publisher.name };

      if (publisher.us !== undefined && publisher.us !== null)
        options.where = { ...options.where, '$Publisher.original$': publisher.us ? 1 : 0 };

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          title: { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' },
        };
        // Ordering remains title/volume/id for cursor stability
      }

      const results = await this.models.Series.findAll(options);
      return buildConnectionFromNodes(results, limit, after || undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models);
      const options = filterService.getFilterOptions(loggedIn, filter);
      const whereWithSymbols = options.where as WhereMap;
      options.group = ['fk_series'];
      options.limit = limit + 1;

      if (decodedCursor) {
        const currentAnd = Array.isArray(whereWithSymbols[Op.and])
          ? (whereWithSymbols[Op.and] as unknown[])
          : [];
        whereWithSymbols[Op.and] = [
          ...currentAnd,
          Sequelize.literal(
            `(sortabletitle(Series.title), Series.volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`,
          ),
        ];
      }

      const res = await this.models.Issue.findAll(options);
      const nodes = res.map((issue) => {
        const issueNode = issue as unknown as IssueWithSeries;
        return {
          id: issueNode.Series.id,
          title: issueNode.Series.title,
          volume: issueNode.Series.volume,
          startyear: issueNode.Series.startyear,
          endyear: issueNode.Series.endyear,
          fk_publisher: issueNode.Series.fk_publisher,
        };
      });
      return buildConnectionFromNodes(nodes, limit, after || undefined);
    }
  }

  async deleteSeries(item: SeriesInput, transaction: Transaction) {
    this.log(`Deleting series: ${item.title} (Vol. ${item.volume})`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findOne({
      where: { title: (item.title || '').trim(), volume: item.volume, fk_publisher: pub.id },
      transaction,
    });

    if (!series) {
      throw new Error('Series not found');
    }

    return await series.deleteInstance(transaction, this.models);
  }

  async createSeries(item: SeriesInput, transaction: Transaction) {
    this.log(`Creating series: ${item.title} (Vol. ${item.volume})`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    return await this.models.Series.create(
      {
        title: (item.title || '').trim(),
        volume: item.volume,
        startyear: item.startyear,
        endyear: item.endyear,
        addinfo: item.addinfo,
        fk_publisher: pub.id,
      },
      { transaction },
    );
  }

  async editSeries(old: SeriesInput, item: SeriesInput, transaction: Transaction) {
    this.log(`Editing series: ${old.title} -> ${item.title}`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (old.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let res = await this.models.Series.findOne({
      where: { title: (old.title || '').trim(), volume: old.volume, fk_publisher: pub.id },
      transaction,
    });

    if (!res) {
      throw new Error('Series not found');
    }

    res.title = (item.title || '').trim();
    res.volume = item.volume || 0;
    res.startyear = item.startyear || 0;
    res.endyear = item.endyear || 0;
    res.addinfo = item.addinfo || '';
    return await res.save({ transaction });
  }

  async getSeriesByIds(ids: readonly number[]) {
    const series = await this.models.Series.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => series.find((s) => s.id === id) || null);
  }
}
