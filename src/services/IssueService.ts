import models from '../models';
import { FindOptions, Op, Sequelize, Transaction } from 'sequelize';
import logger from '../util/logger';
import { Filter, IssueInput, SeriesInput } from '../types/graphql';

export class IssueService {
  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {}

  private log(message: string, level: string = 'info') {
    (logger as any)[level](message, { requestId: this.requestId });
  }

  async findIssues(
    pattern: string | undefined,
    series: SeriesInput,
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
          ['number', 'ASC'],
          ['variant', 'ASC'],
          ['id', 'ASC'],
        ],
        include: [
          {
            model: this.models.Series,
            where: { title: series.title, volume: series.volume },
            include: [
              {
                model: this.models.Publisher,
                where: { name: series.publisher?.name },
              },
            ],
          },
        ],
        where: {} as any,
        limit: limit + 1,
      };

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          Sequelize.literal(`(number, variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`)
        ];
      }

      if (pattern && pattern !== '') {
        options.where = {
          ...options.where,
          [Op.or]: [
            { number: { [Op.like]: pattern + '%' } },
            { title: { [Op.like]: '%' + pattern + '%' } },
          ],
        };
      }

      const results = await this.models.Issue.findAll(options);
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
      options.limit = limit + 1;

      if (decodedCursor) {
        (options.where as any)[Op.and as any] = [
          ...((options.where as any)[Op.and as any] || []),
          Sequelize.literal(`(Issue.number, Issue.variant, Issue.id) > (SELECT number, variant, id FROM Issue WHERE id = ${decodedCursor})`)
        ];
      }

      const results = await this.models.Issue.findAll(options);
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
    }
  }

  async deleteIssue(item: IssueInput, transaction: Transaction) {
    this.log(`Deleting issue: ${item.series?.title} #${item.number}`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.series?.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findOne({
      where: {
        title: (item.series?.title || '').trim(),
        volume: item.series?.volume,
        fk_publisher: pub.id,
      },
      transaction,
    });

    if (!series) throw new Error('Series not found');

    let issue = await this.models.Issue.findOne({
      where: {
        number: item.number ? item.number.trim() : '',
        variant: item.variant ? item.variant.trim() : '',
        fk_series: series.id,
      },
      transaction,
    });

    if (!issue) throw new Error('Issue not found');

    return await (issue as any).deleteInstance(transaction, this.models);
  }

  async createIssue(item: IssueInput, transaction: Transaction) {
    this.log(`Creating issue: ${item.series?.title} #${item.number}`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (item.series?.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findOne({
      where: {
        title: (item.series?.title || '').trim(),
        volume: item.series?.volume,
        fk_publisher: pub.id,
      },
      transaction,
    });

    if (!series) throw new Error('Series not found');

    return await this.models.Issue.create(
      {
        title: (item.title || '').trim(),
        number: (item.number || '').trim(),
        format: item.format,
        variant: (item.variant || '').trim(),
        releasedate: item.releasedate,
        pages: item.pages,
        price: item.price,
        currency: item.currency,
        fk_series: series.id,
        isbn: item.isbn,
        limitation: item.limitation,
        addinfo: item.addinfo,
      },
      { transaction },
    );
  }

  async editIssue(old: IssueInput, item: IssueInput, transaction: Transaction) {
    this.log(`Editing issue: ${old.series?.title} #${old.number}`);
    let pub = await this.models.Publisher.findOne({
      where: { name: (old.series?.publisher?.name || '').trim() },
      transaction,
    });

    if (!pub) throw new Error('Publisher not found');

    let series = await this.models.Series.findOne({
      where: {
        title: (old.series?.title || '').trim(),
        volume: old.series?.volume,
        fk_publisher: pub.id,
      },
      transaction,
    });

    if (!series) throw new Error('Series not found');

    let res = await this.models.Issue.findOne({
      where: {
        number: (old.number || '').trim(),
        variant: (old.variant || '').trim(),
        fk_series: series.id,
      },
      transaction,
    });

    if (!res) throw new Error('Issue not found');

    res.title = (item.title || '').trim();
    res.number = (item.number || '').trim();
    res.format = item.format || '';
    res.variant = (item.variant || '').trim();
    res.releasedate = item.releasedate;
    res.pages = item.pages || 0;
    res.price = item.price || 0;
    res.currency = item.currency || '';
    res.isbn = item.isbn || '';
    res.limitation = item.limitation || '';
    res.addinfo = item.addinfo || '';
    return await res.save({ transaction });
  }

  async getLastEdited(
    filter: Filter | undefined,
    first: number | undefined,
    after: string | undefined,
    order: string | undefined,
    direction: string | undefined,
    loggedIn: boolean,
  ) {
    const limit = first || 25;
    let decodedCursor: number | undefined;
    if (after) {
      decodedCursor = parseInt(Buffer.from(after, 'base64').toString('ascii'), 10);
    }

    const sortField = order || 'updatedAt';
    const sortDirection = direction || 'DESC';

    let options: FindOptions = {
      order: [
        [sortField, sortDirection],
        ['id', sortDirection],
      ],
      limit: limit + 1,
      where: {} as any,
      include: [
        {
          model: this.models.Series,
          include: [{ model: this.models.Publisher }],
        },
      ],
    };

    if (decodedCursor) {
      const op = sortDirection.toUpperCase() === 'DESC' ? Op.lt : Op.gt;
      (options.where as any)[Op.and as any] = [
        Sequelize.literal(
          `(${sortField}, id) ${op === Op.lt ? '<' : '>'} (SELECT ${sortField}, id FROM Issue WHERE id = ${decodedCursor})`,
        ),
      ];
    }

    if (filter) {
      const seriesInclude = (options.include as any[])[0];
      const publisherInclude = seriesInclude.include[0];

      if (filter.us !== undefined && filter.us !== null) {
        publisherInclude.where = { ...publisherInclude.where, original: filter.us ? 1 : 0 };
      }
      if (filter.publishers && filter.publishers.length > 0 && filter.publishers[0]) {
        publisherInclude.where = {
          ...publisherInclude.where,
          name: filter.publishers[0].name,
        };
      }
      if (filter.series && filter.series.length > 0 && filter.series[0]) {
        seriesInclude.where = {
          ...seriesInclude.where,
          title: filter.series[0].title,
          volume: filter.series[0].volume,
        };
      }
    }

    const results = await this.models.Issue.findAll(options);
    const hasNextPage = results.length > limit;
    const nodes = results.slice(0, limit);

    const edges = nodes.map((node) => ({
      cursor: Buffer.from(node.id.toString()).toString('base64'),
      node: node as any,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage,
        hasPreviousPage: !!after,
        startCursor: edges.length > 0 ? edges[0].cursor : null,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null,
      },
    };
  }

  async getIssuesByIds(ids: readonly number[]) {
    const issues = await this.models.Issue.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => issues.find((i) => i.id === id) || null);
  }
}
