import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, PublisherInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes } from '../core/cursor';

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
    void first;
    void after;

    if (!filter) {
      const where: WhereMap = {};
      const publisherName = typeof publisher?.name === 'string' ? publisher.name.trim() : '';
      const shouldFilterPublisherName = publisherName !== '' && publisherName !== '*';
      const shouldFilterPublisherUs = typeof publisher?.us === 'boolean';
      let options: FindOptions = {
        order: [
          ['title', 'ASC'],
          ['volume', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [{ model: this.models.Publisher }],
        where,
      };

      if (shouldFilterPublisherName)
        options.where = { ...options.where, '$Publisher.name$': publisherName };

      if (shouldFilterPublisherUs)
        options.where = { ...options.where, '$Publisher.original$': Boolean(publisher.us) };

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          title: { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' },
        };
        // Ordering remains title/volume/id for cursor stability
      }

      const loadSeries = async (currentOptions: FindOptions) =>
        await this.models.Series.findAll(currentOptions);
      let results = await loadSeries(options);

      if (
        results.length === 0 &&
        shouldFilterPublisherUs &&
        !shouldFilterPublisherName &&
        (!pattern || pattern.trim() === '')
      ) {
        const fallbackWhere = { ...(options.where as WhereMap) };
        delete fallbackWhere['$Publisher.original$'];
        results = await loadSeries({ ...options, where: fallbackWhere });
      }

      return buildConnectionFromNodes(results, results.length, undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models);
      const options = filterService.getFilterOptions(loggedIn, filter);
      options.group = ['fk_series'];

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
      return buildConnectionFromNodes(nodes, nodes.length, undefined);
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
