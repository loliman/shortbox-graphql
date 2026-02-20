import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, IssueInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes, decodeCursorId } from '../core/cursor';
import { naturalCompare } from '../util/util';
import { fromRoman } from '../util/dbFunctions';
import { MarvelCrawlerService } from './MarvelCrawlerService';

const ALLOWED_LAST_EDITED_SORT_FIELDS = new Set([
  'updatedat',
  'createdat',
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
  field && ALLOWED_LAST_EDITED_SORT_FIELDS.has(field) ? field : 'updatedat';

const normalizeSortDirection = (direction: string | undefined): 'ASC' | 'DESC' => {
  if (!direction) return 'DESC';
  const normalized = direction.toUpperCase();
  return normalized === 'ASC' || normalized === 'DESC' ? normalized : 'DESC';
};

const ROMAN_NUMBER_PATTERN = /^(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;
const PARENT_FORMATS = new Set(['HEFT', 'SC', 'HC']);

const compareIssueNumber = (leftRaw: unknown, rightRaw: unknown): number => {
  const left = String(leftRaw ?? '').trim();
  const right = String(rightRaw ?? '').trim();
  const leftIsRoman = left !== '' && ROMAN_NUMBER_PATTERN.test(left);
  const rightIsRoman = right !== '' && ROMAN_NUMBER_PATTERN.test(right);

  if (leftIsRoman && rightIsRoman) {
    return fromRoman(left) - fromRoman(right);
  }
  if (leftIsRoman) return -1;
  if (rightIsRoman) return 1;

  return naturalCompare(left, right);
};

const isParentCandidate = (issue: { format?: string | null; variant?: string | null }): boolean =>
  PARENT_FORMATS.has(String(issue.format ?? '').trim().toUpperCase()) &&
  String(issue.variant ?? '').trim() === '';

const pickIssueRepresentative = <
  T extends { id: number; format?: string | null; variant?: string | null },
>(
  groupedIssues: T[],
): T => {
  const parentCandidates = groupedIssues.filter((issue) => isParentCandidate(issue));
  if (parentCandidates.length > 0) {
    return [...parentCandidates].sort((left, right) => left.id - right.id)[0];
  }

  return [...groupedIssues].sort((left, right) => {
    const variantSort = naturalCompare(String(left.variant ?? ''), String(right.variant ?? ''));
    if (variantSort !== 0) return variantSort;
    return left.id - right.id;
  })[0];
};

const dedupeIssueList = <
  T extends {
    id: number;
    fk_series?: number | null;
    number: string;
    format?: string | null;
    variant?: string | null;
  },
>(
  sortedIssues: T[],
): T[] => {
  const groupedByKey = new Map<string, T[]>();
  const deduped: T[] = [];

  for (const issue of sortedIssues) {
    if (issue.fk_series == null) {
      deduped.push(issue);
      continue;
    }

    const key = `${issue.fk_series}::${String(issue.number ?? '').trim()}`;
    const grouped = groupedByKey.get(key);
    if (grouped) {
      grouped.push(issue);
    } else {
      groupedByKey.set(key, [issue]);
    }
  }

  for (const groupedIssues of groupedByKey.values()) {
    deduped.push(pickIssueRepresentative(groupedIssues));
  }

  return deduped;
};

const normalizeNavbarIssueVariant = <T extends { variant?: string | null }>(issue: T): T => {
  if (String(issue.variant ?? '').trim() === '') return issue;
  return {
    ...issue,
    variant: '',
  };
};

const appendAndCondition = (
  where: Record<string | symbol, unknown>,
  condition: Record<string | symbol, unknown>,
) => {
  const current = Array.isArray(where[Op.and]) ? (where[Op.and] as unknown[]) : [];
  where[Op.and] = [...current, condition];
};

const toNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
};

const toIdKey = (value: unknown): string | null => {
  const numeric = toNumericId(value);
  if (numeric == null) return null;
  return String(numeric);
};

const normalizeDbIds = (ids: readonly unknown[]): number[] =>
  ids.map((id) => toNumericId(id)).filter((id): id is number => id != null);

const normalizeLimitationForDb = (value: unknown): string => {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const trimmed = String(value).trim();
  if (!trimmed) return '0';
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? String(parsed) : '0';
};

export class IssueService {
  private readonly crawler = new MarvelCrawlerService();

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
            { number: { [Op.iLike]: pattern + '%' } },
            { title: { [Op.iLike]: '%' + pattern + '%' } },
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
      const dedupedResults = dedupeIssueList(sortedResults).map(normalizeNavbarIssueVariant);
      return buildConnectionFromNodes(dedupedResults, dedupedResults.length, undefined);
    } else {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models);
      const options = filterService.getFilterOptions(loggedIn, filter);
      const where = options.where as Record<string | symbol, unknown>;
      const seriesTitle = (series.title || '').trim();
      const seriesPublisherName = (series.publisher?.name || '').trim();

      where['$Series.title$'] = seriesTitle;
      where['$Series.volume$'] = series.volume;
      if (seriesPublisherName) {
        where['$Series.Publisher.name$'] = seriesPublisherName;
      }

      if (pattern && pattern !== '') {
        appendAndCondition(where, {
          [Op.or]: [
            { number: { [Op.iLike]: pattern + '%' } },
            { title: { [Op.iLike]: '%' + pattern + '%' } },
          ],
        });
      }

      const results = await this.models.Issue.findAll(options);
      const sortedResults = [...results].sort((a, b) => {
        const numberSort = compareIssueNumber(a.number, b.number);
        if (numberSort !== 0) return numberSort;

        const variantSort = naturalCompare(String(a.variant ?? ''), String(b.variant ?? ''));
        if (variantSort !== 0) return variantSort;

        return a.id - b.id;
      });
      const dedupedResults = dedupeIssueList(sortedResults).map(normalizeNavbarIssueVariant);
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

    const issueInput = item as IssueInput & { comicguideid?: number };

    const createdIssue = await this.models.Issue.create(
      {
        title: (item.title || '').trim(),
        number: (item.number || '').trim(),
        format: item.format,
        variant: (item.variant || '').trim(),
        releasedate: item.releasedate,
        pages: item.pages,
        price: item.price,
        currency: item.currency,
        comicguideid: String(issueInput.comicguideid ?? 0),
        fk_series: series.id,
        isbn: item.isbn,
        limitation: normalizeLimitationForDb(item.limitation),
        addinfo: item.addinfo,
      },
      { transaction },
    );

    await this.syncStoriesFromParentRefs(createdIssue.id, item, transaction);
    return createdIssue;
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
    res.limitation = normalizeLimitationForDb(item.limitation);
    res.addinfo = item.addinfo || '';

    const statusItem = item as IssueInput & {
      verified?: boolean;
      collected?: boolean;
      comicguideid?: number;
    };
    if (typeof statusItem.verified === 'boolean') res.verified = statusItem.verified;
    if (typeof statusItem.collected === 'boolean') res.collected = statusItem.collected;
    if (typeof statusItem.comicguideid === 'number') {
      res.comicguideid = String(statusItem.comicguideid);
    }

    //edit issues

    const savedIssue = await res.save({ transaction });
    await this.syncStoriesFromParentRefs(savedIssue.id, item, transaction);
    return savedIssue;
  }

  private async syncStoriesFromParentRefs(
    issueId: number,
    item: IssueInput,
    transaction: Transaction,
  ): Promise<void> {
    type StoryParentRef = {
      number?: number;
      issue?: {
        number?: string;
        series?: { title?: string; volume?: number };
      };
    };

    type StoryInputLike = {
      number?: number;
      title?: string;
      addinfo?: string;
      part?: string;
      onlyapp?: boolean;
      firstapp?: boolean;
      onlytb?: boolean;
      otheronlytb?: boolean;
      onlyoneprint?: boolean;
      collected?: boolean;
      parent?: StoryParentRef;
    };

    const inputStories = Array.isArray((item as { stories?: unknown[] }).stories)
      ? (((item as { stories?: unknown[] }).stories as unknown[]) || [])
      : [];

    const existingStories = await this.models.Story.findAll({
      where: { fk_issue: issueId },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
    });

    const existingParentsByNumber = new Map<number, Array<number | null>>();
    for (const existingStory of existingStories) {
      const storyNumber = Number(existingStory.number || 0);
      const list = existingParentsByNumber.get(storyNumber) || [];
      list.push(existingStory.fk_parent ?? null);
      existingParentsByNumber.set(storyNumber, list);
    }

    await this.models.Story.destroy({
      where: { fk_issue: issueId },
      transaction,
    });

    if (inputStories.length === 0) return;

    let nextStoryNumber = 1;
    const parentIssueCache = new Map<string, number>();

    for (const rawStory of inputStories) {
      if (!rawStory || typeof rawStory !== 'object') continue;
      const story = rawStory as StoryInputLike;
      const sourceStoryNumber = Number(story.number || 0);
      const fallbackParentCandidates =
        sourceStoryNumber > 0 ? existingParentsByNumber.get(sourceStoryNumber) || [] : [];
      const fallbackParentId =
        fallbackParentCandidates.length > 0 ? fallbackParentCandidates.shift() ?? null : null;
      const parent = story.parent;
      const parentIssue = parent?.issue;
      const parentSeries = parentIssue?.series;

      const parentTitle = String(parentSeries?.title || '').trim();
      const parentVolume = Number(parentSeries?.volume || 0);
      const parentNumber = String(parentIssue?.number || '').trim();
      const createStoryRow = async (parentStoryId: number | null) =>
        this.models.Story.create(
          {
            fk_issue: issueId,
            fk_parent: parentStoryId,
            number: nextStoryNumber++,
            title: String(story.title || ''),
            addinfo: String(story.addinfo || ''),
            part: String(story.part || ''),
            onlyapp: Boolean(story.onlyapp),
            firstapp: Boolean(story.firstapp),
            onlytb: Boolean(story.onlytb),
            otheronlytb: Boolean(story.otheronlytb),
            onlyoneprint: Boolean(story.onlyoneprint),
            collected: Boolean(story.collected),
          },
          { transaction },
        );

      let hasCreatedStory = false;

      if (parentTitle && parentVolume > 0 && parentNumber) {
        const cacheKey = `${parentTitle}::${parentVolume}::${parentNumber}`;
        let parentIssueId = parentIssueCache.get(cacheKey);

        if (!parentIssueId) {
          parentIssueId = await this.findOrCrawlParentIssue(
            {
              title: parentTitle,
              volume: parentVolume,
              number: parentNumber,
            },
            transaction,
          );
          parentIssueCache.set(cacheKey, parentIssueId);
        }

        const parentStories = await this.models.Story.findAll({
          where: { fk_issue: parentIssueId },
          order: [
            ['number', 'ASC'],
            ['id', 'ASC'],
          ],
          transaction,
        });

        const requestedParentStoryNumber = Number(parent?.number || 0);
        if (requestedParentStoryNumber === 0) {
          for (const parentStory of parentStories) {
            await createStoryRow(parentStory.id);
            hasCreatedStory = true;
          }
        } else {
          const selectedParentStory = parentStories.find(
            (entry) => entry.number === requestedParentStoryNumber,
          );
          if (selectedParentStory) {
            await createStoryRow(selectedParentStory.id);
            hasCreatedStory = true;
          }
        }
      }

      if (!hasCreatedStory) await createStoryRow(fallbackParentId);
    }
  }

  private async findOrCrawlParentIssue(
    parent: { title: string; volume: number; number: string },
    transaction: Transaction,
  ): Promise<number> {
    const title = parent.title.trim();
    const number = parent.number.trim();
    const volume = parent.volume;

    let series = await this.models.Series.findOne({
      where: {
        title,
        volume,
      },
      include: [
        {
          model: this.models.Publisher,
          where: { original: true },
        },
      ],
      transaction,
    });

    if (!series) {
      const crawledSeries = await this.crawler.crawlSeries(title, volume);
      const [publisher] = await this.models.Publisher.findOrCreate({
        where: { name: crawledSeries.publisherName.trim() || 'Marvel Comics' },
        defaults: {
          name: crawledSeries.publisherName.trim() || 'Marvel Comics',
          original: true,
          addinfo: '',
          startyear: 0,
          endyear: 0,
        },
        transaction,
      });

      series = await this.models.Series.create(
        {
          title: crawledSeries.title,
          volume: crawledSeries.volume,
          startyear: crawledSeries.startyear || 0,
          endyear: crawledSeries.endyear || 0,
          addinfo: '',
          fk_publisher: publisher.id,
        },
        { transaction },
      );
    }

    let issue = await this.models.Issue.findOne({
      where: {
        number,
        fk_series: series.id,
      },
      transaction,
    });

    if (!issue) {
      const crawledIssue = await this.crawler.crawlIssue(title, volume, number);
      issue = await this.models.Issue.create(
        {
          title: '',
          number,
          format: 'Heft',
          variant: '',
          releasedate: crawledIssue.releasedate,
          pages: 0,
          price: crawledIssue.price || 0,
          currency: crawledIssue.currency || 'USD',
          comicguideid: '0',
          isbn: '',
          limitation: normalizeLimitationForDb(undefined),
          addinfo: '',
          fk_series: series.id,
        },
        { transaction },
      );

      if (crawledIssue.coverUrl) {
        await this.models.Cover.create(
          {
            fk_issue: issue.id,
            number: 0,
            url: crawledIssue.coverUrl,
            addinfo: '',
          },
          { transaction },
        );
      }

      for (const crawledStory of crawledIssue.stories) {
        await this.models.Story.create(
          {
            fk_issue: issue.id,
            number: Number(crawledStory.number || 0) || 1,
            title: String(crawledStory.title || ''),
            addinfo: '',
            part: '',
          },
          { transaction },
        );
      }
    }

    return issue.id;
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
    let include: FindOptions['include'] = [
      {
        model: this.models.Series,
        required: true,
        include: [{ model: this.models.Publisher }],
      },
    ];
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

    if (filter) {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models, this.requestId);
      const filterOptions = filterService.getFilterOptions(loggedIn, filter);

      const filterWhere = (filterOptions.where || {}) as WhereMap;
      Object.assign(where, filterWhere);
      where.fk_series = { [Op.ne]: null };

      if (filterOptions.include) {
        include = filterOptions.include;
      }
    }

    let options: FindOptions = {
      order: orderBy,
      limit: limit + 1,
      where,
      include,
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

    const results = await this.models.Issue.findAll(options);
    return buildConnectionFromNodes(results, limit, after || undefined);
  }

  async getIssuesByIds(ids: readonly number[]) {
    const dbIds = normalizeDbIds(ids as unknown as readonly unknown[]);
    if (dbIds.length === 0) return ids.map(() => null);
    const issues = await this.models.Issue.findAll({
      where: { id: { [Op.in]: dbIds } },
    });
    return ids.map((id) => {
      const idKey = toIdKey(id);
      if (!idKey) return null;
      return issues.find((i) => toIdKey(i.id) === idKey) || null;
    });
  }

  async getStoriesByIssueIds(issueIds: readonly number[]) {
    const dbIssueIds = normalizeDbIds(issueIds as unknown as readonly unknown[]);
    if (dbIssueIds.length === 0) return issueIds.map(() => []);
    const stories = await this.models.Story.findAll({
      where: { fk_issue: { [Op.in]: dbIssueIds } },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return issueIds.map((issueId) => {
      const issueIdKey = toIdKey(issueId);
      if (!issueIdKey) return [];
      return stories.filter((story) => toIdKey(story.fk_issue) === issueIdKey);
    });
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

  async getVariantsByIssueIds(issueIds: readonly number[]) {
    const dbIssueIds = normalizeDbIds(issueIds as unknown as readonly unknown[]);
    if (dbIssueIds.length === 0) return issueIds.map(() => []);

    const uniqueIssueIds = [...new Set(dbIssueIds)];
    const baseIssues = await this.models.Issue.findAll({
      where: { id: { [Op.in]: uniqueIssueIds } },
      attributes: ['id', 'fk_series', 'number'],
    });

    const byIssueId = new Map<string, { fk_series: unknown; number: string }>();
    for (const issue of baseIssues) {
      const issueIdKey = toIdKey(issue.id);
      if (!issueIdKey) continue;
      byIssueId.set(issueIdKey, {
        fk_series: issue.fk_series,
        number: String(issue.number ?? '').trim(),
      });
    }

    const siblingKeys = new Map<string, { fkSeries: unknown; number: string }>();
    for (const issue of baseIssues) {
      const fkSeries = issue.fk_series;
      const number = String(issue.number ?? '').trim();
      const fkSeriesKey = toIdKey(fkSeries);
      if (!fkSeriesKey || number === '') continue;
      siblingKeys.set(`${fkSeriesKey}::${number}`, { fkSeries, number });
    }

    const whereOr = [...siblingKeys.values()].map(({ fkSeries, number }) => ({
      fk_series: fkSeries,
      number,
    }));

    const siblings =
      whereOr.length > 0
        ? await this.models.Issue.findAll({
            where: { [Op.or]: whereOr },
            order: [
              ['format', 'ASC'],
              ['variant', 'ASC'],
              ['id', 'ASC'],
            ],
          })
        : [];

    const siblingsByKey = new Map<string, typeof siblings>();
    for (const sibling of siblings) {
      const siblingSeriesKey = toIdKey(sibling.fk_series);
      if (!siblingSeriesKey) continue;
      const key = `${siblingSeriesKey}::${String(sibling.number ?? '').trim()}`;
      const grouped = siblingsByKey.get(key);
      if (grouped) grouped.push(sibling);
      else siblingsByKey.set(key, [sibling]);
    }

    return issueIds.map((issueId) => {
      const issueIdKey = toIdKey(issueId);
      if (!issueIdKey) return [];
      const base = byIssueId.get(issueIdKey);
      const fkSeriesKey = toIdKey(base?.fk_series);
      if (!base || !fkSeriesKey || base.number === '') return [];
      return siblingsByKey.get(`${fkSeriesKey}::${base.number}`) || [];
    });
  }
}
