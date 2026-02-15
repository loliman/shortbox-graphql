import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, IssueInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes, decodeCursorId } from '../core/cursor';
import { naturalCompare } from '../util/util';

const ALLOWED_LAST_EDITED_SORT_FIELDS = new Set([
  'updatedAt',
  'createdAt',
  'number',
  'format',
  'variant',
  'title',
  'id',
  'releasedate',
  'series',
  'publisher',
]);

const normalizeSortField = (field: string | undefined): string =>
  field && ALLOWED_LAST_EDITED_SORT_FIELDS.has(field) ? field : 'updatedAt';

const normalizeSortDirection = (direction: string | undefined): 'ASC' | 'DESC' => {
  if (!direction) return 'DESC';
  const normalized = direction.toUpperCase();
  return normalized === 'ASC' || normalized === 'DESC' ? normalized : 'DESC';
};

const ROMAN_NUMBER_PATTERN = /^(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;

const romanToNumber = (roman: string): number => {
  const values: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  const chars = roman.toUpperCase().split('');
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    const current = values[chars[i]] || 0;
    const next = values[chars[i + 1]] || 0;
    total += current < next ? -current : current;
  }
  return total;
};

const compareIssueNumber = (leftRaw: unknown, rightRaw: unknown): number => {
  const left = String(leftRaw ?? '').trim();
  const right = String(rightRaw ?? '').trim();
  const leftIsRoman = left !== '' && ROMAN_NUMBER_PATTERN.test(left);
  const rightIsRoman = right !== '' && ROMAN_NUMBER_PATTERN.test(right);

  if (leftIsRoman && rightIsRoman) {
    return romanToNumber(left) - romanToNumber(right);
  }
  if (leftIsRoman) return -1;
  if (rightIsRoman) return 1;

  return naturalCompare(left, right);
};

const dedupeIssueList = <T extends { id: number; fk_series?: number | null; number: string }>(
  sortedIssues: T[],
): T[] => {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const issue of sortedIssues) {
    if (issue.fk_series == null) {
      deduped.push(issue);
      continue;
    }

    const key = `${issue.fk_series}::${String(issue.number ?? '').trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }

  return deduped;
};

export class IssueService {
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

  async findIssues(
    pattern: string | undefined,
    series: SeriesInput,
    first: number | undefined,
    after: string | undefined,
    loggedIn: boolean,
    filter: Filter | undefined,
  ) {
    void first;
    void after;

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
        where: {},
      };

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
      const sortedResults = [...results].sort((a, b) => {
        const numberSort = compareIssueNumber(a.number, b.number);
        if (numberSort !== 0) return numberSort;

        const variantSort = naturalCompare(String(a.variant ?? ''), String(b.variant ?? ''));
        if (variantSort !== 0) return variantSort;

        return a.id - b.id;
      });
      const dedupedResults = dedupeIssueList(sortedResults);
      return buildConnectionFromNodes(dedupedResults, dedupedResults.length, undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models);
      const options = filterService.getFilterOptions(loggedIn, filter);

      const results = await this.models.Issue.findAll(options);
      const sortedResults = [...results].sort((a, b) => {
        const numberSort = compareIssueNumber(a.number, b.number);
        if (numberSort !== 0) return numberSort;

        const variantSort = naturalCompare(String(a.variant ?? ''), String(b.variant ?? ''));
        if (variantSort !== 0) return variantSort;

        return a.id - b.id;
      });
      const dedupedResults = dedupeIssueList(sortedResults);
      return buildConnectionFromNodes(dedupedResults, dedupedResults.length, undefined);
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

    return await issue.deleteInstance(transaction, this.models);
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
        comicguideid: 0,
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
    res.releasedate = item.releasedate ?? '';
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
    type WhereMap = Record<string | symbol, unknown>;
    const limit = first || 25;
    const decodedCursor = decodeCursorId(after || undefined);

    const sortField = normalizeSortField(order);
    const sortDirection = normalizeSortDirection(direction);

    const where: WhereMap = {
      fk_series: { [Op.ne]: null },
    };
    const orderBy =
      sortField === 'series'
        ? ([
            [{ model: this.models.Series }, 'title', sortDirection],
            [{ model: this.models.Series }, 'volume', sortDirection],
            ['id', sortDirection],
          ] as FindOptions['order'])
        : sortField === 'publisher'
          ? ([
              [
                { model: this.models.Series },
                { model: this.models.Publisher },
                'name',
                sortDirection,
              ],
              [{ model: this.models.Series }, 'title', sortDirection],
              [{ model: this.models.Series }, 'volume', sortDirection],
              ['id', sortDirection],
            ] as FindOptions['order'])
          : ([
              [sortField, sortDirection],
              ['id', sortDirection],
            ] as FindOptions['order']);

    let options: FindOptions = {
      order: orderBy,
      limit: limit + 1,
      where,
      include: [
        {
          model: this.models.Series,
          required: true,
          include: [{ model: this.models.Publisher }],
        },
      ],
    };

    if (decodedCursor) {
      const op = sortDirection.toUpperCase() === 'DESC' ? Op.lt : Op.gt;
      const currentAnd = Array.isArray(where[Op.and]) ? (where[Op.and] as unknown[]) : [];
      if (sortField === 'series' || sortField === 'publisher') {
        where[Op.and] = [...currentAnd, { id: { [op]: decodedCursor } }];
      } else {
        const cursorRecord = await this.models.Issue.findByPk(decodedCursor, {
          attributes: ['id', sortField],
        });

        if (cursorRecord) {
          const cursorValue = cursorRecord.get(sortField as keyof typeof cursorRecord) as
            | string
            | number
            | Date
            | null
            | undefined;

          if (cursorValue === null || cursorValue === undefined) {
            where[Op.and] = [...currentAnd, { id: { [op]: decodedCursor } }];
          } else {
            where[Op.and] = [
              ...currentAnd,
              {
                [Op.or]: [
                  { [sortField]: { [op]: cursorValue } },
                  { [sortField]: cursorValue, id: { [op]: decodedCursor } },
                ],
              },
            ];
          }
        }
      }
    }

    if (filter) {
      const includeList = options.include as Array<{
        where?: Record<string, unknown>;
        include?: Array<{ where?: Record<string, unknown> }>;
      }>;
      const seriesInclude = includeList[0];
      const publisherInclude = seriesInclude.include?.[0];

      if (publisherInclude && filter.us !== undefined && filter.us !== null) {
        publisherInclude.where = { ...publisherInclude.where, original: filter.us ? 1 : 0 };
      }
      if (
        publisherInclude &&
        filter.publishers &&
        filter.publishers.length > 0 &&
        filter.publishers[0]
      ) {
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
    return buildConnectionFromNodes(results, limit, after || undefined);
  }

  async getIssuesByIds(ids: readonly number[]) {
    const issues = await this.models.Issue.findAll({
      where: { id: { [Op.in]: [...ids] } },
    });
    return ids.map((id) => issues.find((i) => i.id === id) || null);
  }

  async getStoriesByIssueIds(issueIds: readonly number[]) {
    const stories = await this.models.Story.findAll({
      where: { fk_issue: { [Op.in]: [...issueIds] } },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return issueIds.map((issueId) => stories.filter((story) => story.fk_issue === issueId));
  }

  async getPrimaryCoversByIssueIds(issueIds: readonly number[]) {
    const covers = await this.models.Cover.findAll({
      where: {
        fk_issue: { [Op.in]: [...issueIds] },
        number: 0,
      },
      order: [['id', 'ASC']],
    });
    return issueIds.map((issueId) => covers.find((cover) => cover.fk_issue === issueId) || null);
  }

  async getCoversByIssueIds(issueIds: readonly number[]) {
    const covers = await this.models.Cover.findAll({
      where: { fk_issue: { [Op.in]: [...issueIds] } },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return issueIds.map((issueId) => covers.filter((cover) => cover.fk_issue === issueId));
  }

  async getFeaturesByIssueIds(issueIds: readonly number[]) {
    const features = await this.models.Feature.findAll({
      where: { fk_issue: { [Op.in]: [...issueIds] } },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return issueIds.map((issueId) => features.filter((feature) => feature.fk_issue === issueId));
  }

  async getVariantsBySeriesAndNumberKeys(keys: readonly string[]) {
    if (keys.length === 0) return [];

    const parsedKeys = keys.map((key) => {
      const [seriesPart, ...numberParts] = key.split('::');
      const fkSeries = parseInt(seriesPart || '', 10);
      return {
        key,
        fkSeries: Number.isFinite(fkSeries) ? fkSeries : 0,
        number: numberParts.join('::'),
      };
    });

    const whereOr = parsedKeys.map(({ fkSeries, number }) => ({
      fk_series: fkSeries,
      number,
    }));

    const variants = await this.models.Issue.findAll({
      where: { [Op.or]: whereOr },
      order: [
        ['variant', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    return parsedKeys.map(({ fkSeries, number }) =>
      variants.filter((variant) => variant.fk_series === fkSeries && variant.number === number),
    );
  }
}
