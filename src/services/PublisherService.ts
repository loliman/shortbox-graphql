import models from '../models';
import { FindOptions, Op, Sequelize, Transaction } from 'sequelize';
import logger from '../util/logger';
import { Filter, Publisher, PublisherInput } from '../types/graphql';

export class PublisherService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  async findPublishers(
    pattern: string | undefined,
    us: boolean,
    first: number | undefined,
    after: string | undefined,
    loggedIn: boolean,
    filter: Filter | undefined,
  ) {
    const limit = first || 50;
    let decodedCursor: number | undefined;
    if (after) {
      decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
    }

    if (!filter) {
      let options: FindOptions = {
        order: [['name', 'ASC'], ['id', 'ASC']],
        where: { original: us } as any,
        limit: limit + 1,
      };

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          Sequelize.literal(`(name, id) > (SELECT name, id FROM Publisher WHERE id = ${decodedCursor})`)
        ];
      }

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          name: { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' },
        };
        // Note: Complex ordering with cursor-based pagination is tricky. 
        // For now we stick to name/id ordering when using pattern search to keep cursor stability.
      }

      const results = await this.models.Publisher.findAll(options);
      const hasNextPage = results.length > limit;
      const nodes = results.slice(0, limit);

      const edges = nodes.map(node => ({
        cursor: Buffer.from(node.id.toString()).toString('base64'),
        node: node as any
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        }
      };
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models, this.requestId);
      const options = filterService.getFilterOptions(loggedIn, filter);
      options.group = ['Series.fk_publisher'];
      options.limit = limit + 1;

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          ...((options.where as any)[Op.and as any] || []),
          Sequelize.literal(`(Series->Publisher.name, Series->Publisher.id) > (SELECT name, id FROM Publisher WHERE id = ${decodedCursor})`)
        ];
      }
      
      const res = await this.models.Issue.findAll(options);
      const hasNextPage = res.length > limit;
      const nodes = res.slice(0, limit).map((i: any) => ({
        id: i.Series.Publisher.id,
        name: i.Series.Publisher.name,
        original: us,
      }));

      const edges = nodes.map(node => ({
        cursor: Buffer.from(node.id.toString()).toString('base64'),
        node: node as any
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!after,
          startCursor: edges.length > 0 ? edges[0].cursor : null,
          endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
        }
      };
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
      await (s as any).deleteInstance(transaction, this.models);
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
