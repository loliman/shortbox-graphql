import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, PublisherInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes } from '../core/cursor';

export class PublisherService {
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

  async findPublishers(
    pattern: string | undefined,
    us: boolean,
    first: number | undefined,
    after: string | undefined,
    loggedIn: boolean,
    filter: Filter | undefined,
  ) {
    type WhereMap = Record<string | symbol, unknown>;
    type IssueWithSeriesPublisher = {
      series: {
        publisher: {
          id: number;
          name: string;
        };
      };
    };
    type PublisherNode = {
      id: number;
      name: string;
      original: boolean;
    };
    void first;
    void after;

    if (!filter) {
      const where: WhereMap = { original: us };
      let options: FindOptions = {
        order: [
          ['name', 'ASC'],
          ['id', 'ASC'],
        ],
        where,
      };

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          name: { [Op.iLike]: '%' + pattern.replace(/\s/g, '%') + '%' },
        };
        // Note: Complex ordering with cursor-based pagination is tricky.
        // For now we stick to name/id ordering when using pattern search to keep cursor stability.
      }

      const results = await this.models.Publisher.findAll(options);
      const nodes: PublisherNode[] = results.map((node) => ({
        id: node.id,
        name: node.name,
        original: Boolean(node.original),
      }));
      return buildConnectionFromNodes(nodes, nodes.length, undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models, this.requestId);
      const options = filterService.getFilterOptions(loggedIn, filter);
      options.attributes = ['id'];
      const where = options.where as Record<string | symbol, unknown>;
      where['$series.publisher.original$'] = us;

      const includeList = options.include as Array<{ attributes?: string[]; include?: unknown[] }>;
      const seriesInclude = includeList[0];
      if (seriesInclude) {
        seriesInclude.attributes = ['id', 'fk_publisher'];
        const nestedInclude = seriesInclude.include as Array<{ attributes?: string[] }> | undefined;
        const publisherInclude = nestedInclude?.[0];
        if (publisherInclude) {
          publisherInclude.attributes = ['id', 'name'];
        }
      }

      const res = await this.models.Issue.findAll(options);
      const uniqueNodes = new Map<number, PublisherNode>();
      res.forEach((issue) => {
        const issueNode = issue as unknown as IssueWithSeriesPublisher;
        uniqueNodes.set(issueNode.series.publisher.id, {
          id: issueNode.series.publisher.id,
          name: issueNode.series.publisher.name,
          original: us,
        });
      });

      const nodes = [...uniqueNodes.values()].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      return buildConnectionFromNodes(nodes, nodes.length, undefined);
    }
  }

  async deletePublisher(item: PublisherInput, transaction: Transaction) {
    this.log(`Deleting publisher: ${item.name}`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findAll({
      where: { fk_publisher: pub.id },
      transaction,
    });

    for (const s of series) {
      await s.deleteInstance(transaction, this.models);
    }

    return await pub.destroy({ transaction });
  }

  async createPublisher(item: PublisherInput, transaction: Transaction) {
    this.log(`Creating publisher: ${item.name}`);
    return await this.models.Publisher.create(
      {
        name: (item.name || '').trim(),
        addinfo: item.addinfo,
        original: item.us,
        startyear: item.startyear,
        endyear: item.endyear,
      },
      { transaction },
    );
  }

  async editPublisher(old: PublisherInput, item: PublisherInput, transaction: Transaction) {
    this.log(`Editing publisher: ${old.name} -> ${item.name}`);
    let res = await this.models.Publisher.findOne({
      where: { name: (old.name || '').trim() },
      transaction,
    });

    if (!res) throw new Error('Publisher not found');

    res.name = (item.name || '').trim();
    res.addinfo = item.addinfo || '';
    res.startyear = item.startyear || 0;
    res.endyear = item.endyear || 0;
    return await res.save({ transaction });
  }

  async getPublishersByIds(ids: readonly number[]) {
    const publishers = await this.models.Publisher.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    // Map result back to the order of IDs
    return ids.map((id) => publishers.find((p) => p.id === id) || null);
  }
}
