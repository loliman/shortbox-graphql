import models from '../models';
import { FindOptions, Op, Sequelize, Transaction } from 'sequelize';
import logger from '../util/logger';
import { Filter, PublisherInput, SeriesInput } from '../types/graphql';

export class SeriesService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  async findSeries(
    pattern: string | undefined,
    publisher: PublisherInput,
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
        order: [
          [Sequelize.fn('sortabletitle', Sequelize.col('title')), 'ASC'],
          ['volume', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [{ model: this.models.Publisher }],
        where: {} as any,
        limit: limit + 1,
      };

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          Sequelize.literal(`(sortabletitle(title), volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`)
        ];
      }

      if (publisher.name !== '*') options.where = { ...options.where, '$Publisher.name$': publisher.name };

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
      const filterService = new FilterService(this.models);
      const options = filterService.getFilterOptions(loggedIn, filter);
      options.group = ['fk_series'];
      options.limit = limit + 1;

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          ...((options.where as any)[Op.and as any] || []),
          Sequelize.literal(`(sortabletitle(Series.title), Series.volume, Series.id) > (SELECT sortabletitle(title), volume, id FROM Series WHERE id = ${decodedCursor})`)
        ];
      }

      const res = await this.models.Issue.findAll(options);
      const hasNextPage = res.length > limit;
      const nodes = res.slice(0, limit).map((i: any) => ({
        id: i.Series.id,
        title: i.Series.title,
        volume: i.Series.volume,
        startyear: i.Series.startyear,
        endyear: i.Series.endyear,
        fk_publisher: i.Series.fk_publisher,
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

    return await (series as any).deleteInstance(transaction, this.models);
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
