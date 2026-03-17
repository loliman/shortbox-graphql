import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, IssueInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes, decodeCursorId } from '../core/cursor';
import { naturalCompare } from '../util/util';
import { fromRoman } from '../util/dbFunctions';
import { MarvelCrawlerService } from './MarvelCrawlerService';
import { updateStoryFilterFlagsForIssue } from '../util/FilterUpdater';
import {
  compareIssueVariants,
  pickPreferredIssueVariant,
  sortIssueVariants,
} from '../util/issueVariantOrdering';
import { ChangeRequestRepository } from '../repositories/ChangeRequestRepository';
import type {
  ChangeRequestEntity,
  ChangeRequestType,
  CreateChangeRequestInput,
} from '../types/changeRequest';

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

const normalizeLastEditedFilter = (filter: Filter | undefined): Filter | undefined => {
  return filter;
};

const ROMAN_NUMBER_PATTERN = /^(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;
const FRACTION_NUMBER_PATTERN = /^(-?\d+)\s*\/\s*(\d+)$/;
const DECIMAL_NUMBER_PATTERN = /^-?\d+(?:[.,]\d+)?$/;
const UNICODE_FRACTION_VALUES: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
};
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LEGACY_DATE_DOT_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const LEGACY_DATE_DASH_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;
const LEGACY_DATE_SHORT_YEAR_PATTERN = /^(\d{2})-(\d{2})-(\d{2})$/;
const RELEASE_DATE_TIMEZONE = 'Europe/Berlin';
const RELEASE_DATE_FALLBACK = '1970-01-01';

const normalizeString = (value: unknown): string => String(value ?? '').trim();
const normalizeLower = (value: unknown): string => normalizeString(value).toLowerCase();
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const normalizeIssueReleaseDate = (value: unknown): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }

  const normalized = normalizeString(value);
  if (normalized.length === 0) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const coerceReleaseDateForDb = (value: unknown): string => {
  const toFallback = (): string => RELEASE_DATE_FALLBACK;

  const toIsoDate = (date: Date): string => {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: RELEASE_DATE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = dateParts.find((part) => part.type === 'year')?.value;
    const month = dateParts.find((part) => part.type === 'month')?.value;
    const day = dateParts.find((part) => part.type === 'day')?.value;

    return year && month && day ? `${year}-${month}-${day}` : toFallback();
  };

  const fromDateParts = (year: number, month: number, day: number): string => {
    const parsed = new Date(year, month - 1, day);
    const isValid =
      parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    if (!isValid) return toFallback();
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const normalizeTwoDigitYear = (year: number): number => {
    const now = new Date();
    const currentYearTwoDigits = now.getFullYear() % 100;
    return year <= currentYearTwoDigits + 1 ? 2000 + year : 1900 + year;
  };

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? toFallback() : toIsoDate(value);
  }

  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? toFallback() : toIsoDate(parsed);
  }

  const trimmed = normalizeString(value);
  if (!trimmed || normalizeLower(trimmed) === 'invalid date') return toFallback();

  const isoMatch = trimmed.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    return fromDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dotMatch = trimmed.match(LEGACY_DATE_DOT_PATTERN);
  if (dotMatch) {
    return fromDateParts(Number(dotMatch[3]), Number(dotMatch[2]), Number(dotMatch[1]));
  }

  const dashMatch = trimmed.match(LEGACY_DATE_DASH_PATTERN);
  if (dashMatch) {
    return fromDateParts(Number(dashMatch[3]), Number(dashMatch[2]), Number(dashMatch[1]));
  }

  const shortYearMatch = trimmed.match(LEGACY_DATE_SHORT_YEAR_PATTERN);
  if (shortYearMatch) {
    return fromDateParts(
      normalizeTwoDigitYear(Number(shortYearMatch[3])),
      Number(shortYearMatch[2]),
      Number(shortYearMatch[1]),
    );
  }

  const directDate = new Date(trimmed);
  return Number.isNaN(directDate.getTime()) ? toFallback() : toIsoDate(directDate);
};

const parseSortableIssueNumber = (value: string): number | null => {
  const trimmed = value.trim();
  const unicodeFractionMatch = trimmed.match(/^(-?\d+)?\s*([¼½¾])$/);
  if (unicodeFractionMatch) {
    const whole = Number(unicodeFractionMatch[1] || 0);
    const fraction = UNICODE_FRACTION_VALUES[unicodeFractionMatch[2]];
    if (Number.isFinite(whole) && fraction != null) return whole + fraction;
  }

  const fractionMatch = trimmed.match(FRACTION_NUMBER_PATTERN);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
    return null;
  }

  if (!DECIMAL_NUMBER_PATTERN.test(trimmed)) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

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

  const leftSortable = parseSortableIssueNumber(left);
  const rightSortable = parseSortableIssueNumber(right);
  if (leftSortable != null && rightSortable != null && leftSortable !== rightSortable) {
    return leftSortable - rightSortable;
  }

  return naturalCompare(left, right);
};

const pickIssueRepresentative = <
  T extends { id: number; format?: string | null; variant?: string | null },
>(
  groupedIssues: T[],
): T => {
  return (
    pickPreferredIssueVariant(groupedIssues) ||
    [...groupedIssues].sort((left, right) => left.id - right.id)[0]
  );
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
  issue.variant = '';
  return issue;
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

const toSeriesNumberGroupKey = (issue: {
  fk_series?: unknown;
  number?: unknown;
}): string | null => {
  const seriesIdKey = toIdKey(issue.fk_series);
  const number = String(issue.number ?? '').trim();
  if (!seriesIdKey || number === '') return null;
  return `${seriesIdKey}::${number}`;
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
  private readonly changeRequestRepository: ChangeRequestRepository;

  constructor(
    private models: typeof import('../models').default,
    private requestId?: string,
  ) {
    this.changeRequestRepository = new ChangeRequestRepository(this.models);
  }

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
            as: 'series',
            where: { title: series.title, volume: series.volume },
            include: [
              {
                model: this.models.Publisher,
                as: 'publisher',
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

        return compareIssueVariants(a, b);
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

      where['$series.title$'] = seriesTitle;
      where['$series.volume$'] = series.volume;
      if (seriesPublisherName) {
        where['$series.publisher.name$'] = seriesPublisherName;
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

        return compareIssueVariants(a, b);
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

    const issueWhere: Record<string, unknown> = {
      number: item.number ? item.number.trim() : '',
      variant: item.variant ? item.variant.trim() : '',
      fk_series: series.id,
    };
    const itemFormat = typeof item.format === 'string' ? item.format.trim() : '';
    if (itemFormat !== '') issueWhere.format = itemFormat;

    let issue = await this.models.Issue.findOne({
      where: issueWhere,
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

    const issueInput = item as IssueInput & { comicguideid?: number; legacy_number?: string };

    const createdIssue = await this.models.Issue.create(
      {
        title: (item.title || '').trim(),
        number: (item.number || '').trim(),
        format: item.format,
        variant: (item.variant || '').trim(),
        releasedate: coerceReleaseDateForDb(item.releasedate),
        legacy_number: issueInput.legacy_number || '',
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
    await updateStoryFilterFlagsForIssue(this.models, createdIssue.id, transaction);
    return createdIssue;
  }

  async editIssue(old: IssueInput, item: IssueInput, transaction: Transaction) {
    this.log(`Editing issue: ${old.series?.title} #${old.number}`);
    const oldPublisher = await this.models.Publisher.findOne({
      where: { name: (old.series?.publisher?.name || '').trim() },
      transaction,
    });

    if (!oldPublisher) throw new Error('Publisher not found');

    const oldSeries = await this.models.Series.findOne({
      where: {
        title: (old.series?.title || '').trim(),
        volume: old.series?.volume,
        fk_publisher: oldPublisher.id,
      },
      transaction,
    });

    if (!oldSeries) throw new Error('Series not found');

    const issueWhere: Record<string, unknown> = {
      number: (old.number || '').trim(),
      variant: (old.variant || '').trim(),
      fk_series: oldSeries.id,
    };
    const oldFormat = typeof old.format === 'string' ? old.format.trim() : '';
    if (oldFormat !== '') issueWhere.format = oldFormat;

    let res = await this.models.Issue.findOne({
      where: issueWhere,
      transaction,
    });

    if (!res) throw new Error('Issue not found');

    const newPublisher = await this.models.Publisher.findOne({
      where: { name: (item.series?.publisher?.name || '').trim() },
      transaction,
    });

    if (!newPublisher) throw new Error('Publisher not found');

    const newSeries = await this.models.Series.findOne({
      where: {
        title: (item.series?.title || '').trim(),
        volume: item.series?.volume,
        fk_publisher: newPublisher.id,
      },
      transaction,
    });

    if (!newSeries) throw new Error('Series not found');

    const oldNumber = (old.number || '').trim();
    const seriesChanged = oldSeries.id !== newSeries.id;
    const siblingIssuesToMove = seriesChanged
      ? await this.models.Issue.findAll({
          where: {
            number: oldNumber,
            fk_series: oldSeries.id,
          },
          transaction,
        })
      : [];

    res.title = (item.title || '').trim();
    res.number = (item.number || '').trim();
    res.format = item.format || '';
    res.variant = (item.variant || '').trim();
    res.releasedate = coerceReleaseDateForDb(item.releasedate);
    const issueUpdateInput = item as IssueInput & { legacy_number?: string };
    res.legacy_number = issueUpdateInput.legacy_number || '';
    res.pages = item.pages || 0;
    res.price = item.price || 0;
    res.currency = item.currency || '';
    res.isbn = item.isbn || '';
    res.limitation = normalizeLimitationForDb(item.limitation);
    res.addinfo = item.addinfo || '';
    res.fk_series = newSeries.id;

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
    if (seriesChanged) {
      for (const siblingIssue of siblingIssuesToMove) {
        if (!siblingIssue || siblingIssue.id === savedIssue.id) continue;
        siblingIssue.fk_series = newSeries.id;
        await siblingIssue.save({ transaction });
      }
    }
    const shouldSyncStories =
      typeof item === 'object' && item !== null && hasOwn(item as Record<string, unknown>, 'stories');

    if (!oldPublisher.original && shouldSyncStories) {
      const removedUsParentStoryIds = await this.syncStoriesFromParentRefs(
        savedIssue.id,
        item,
        transaction,
      );
      await updateStoryFilterFlagsForIssue(this.models, savedIssue.id, transaction);
      const removedUsIssueIds = await this.resolveIssueIdsFromStoryIds(
        removedUsParentStoryIds,
        transaction,
      );
      for (const removedUsIssueId of removedUsIssueIds) {
        await updateStoryFilterFlagsForIssue(this.models, removedUsIssueId, transaction);
      }
    }
    return savedIssue;
  }

  async reportError(
    issue: IssueInput,
    item: IssueInput,
    transaction: Transaction,
  ): Promise<ChangeRequestEntity> {
    const targetIssue = await this.resolveIssueByIdentity(issue, transaction);
    if (!targetIssue) throw new Error('Issue not found');

    const normalizedItem = normalizeForDiff(item);

    const payload: CreateChangeRequestInput = {
      issueId: targetIssue.id as number,
      type: 'ISSUE',
      changeRequest: {
        item: normalizedItem,
      },
    };

    return await this.changeRequestRepository.create(payload, transaction);
  }

  async listChangeRequests(
    options?: {
      type?: ChangeRequestType;
      order?: string;
      direction?: string;
    },
    transaction?: Transaction,
  ): Promise<ChangeRequestEntity[]> {
    const changeRequests = await this.changeRequestRepository.findAll({
      type: options?.type,
      order: options?.order,
      direction: options?.direction,
      transaction,
    });

    if (changeRequests.length === 0) return [];

    const loadedIssuesByChangeRequestId = new Map<number, Record<string, unknown> | null>();
    await Promise.all(
      changeRequests.map(async (entry) => {
        const loadedIssue = await this.loadIssueForChangeRequest(entry.issueId, transaction);
        loadedIssuesByChangeRequestId.set(entry.id, loadedIssue);
      }),
    );

    return changeRequests.map((entry) => {
      const loadedIssue = loadedIssuesByChangeRequestId.get(entry.id) || null;

      const normalizedPayload = normalizeChangeRequestPayload(entry.changeRequest, loadedIssue);
      return {
        ...entry,
        changeRequest: normalizedPayload,
      };
    });
  }

  async countChangeRequests(
    options?: {
      type?: ChangeRequestType;
    },
    transaction?: Transaction,
  ): Promise<number> {
    return await this.changeRequestRepository.count({
      type: options?.type,
      transaction,
    });
  }

  async discardChangeRequest(id: number, transaction: Transaction): Promise<boolean> {
    return await this.changeRequestRepository.deleteById(id, transaction);
  }

  async acceptChangeRequest(id: number, transaction: Transaction) {
    const changeRequest = await this.changeRequestRepository.findById(id, transaction);
    if (!changeRequest) throw new Error('Change Request nicht gefunden');

    const issue = await this.loadIssueForChangeRequest(changeRequest.issueId, transaction);
    if (!issue) throw new Error('Issue zum Change Request nicht gefunden');

    const item = resolveChangeRequestItem(changeRequest.changeRequest, issue);
    if (!item) throw new Error('Ungültiger Change Request');

    const updatedIssue = await this.editIssue(issue as IssueInput, item as IssueInput, transaction);
    await this.changeRequestRepository.deleteById(id, transaction);
    return updatedIssue;
  }

  private async syncStoriesFromParentRefs(
    issueId: number,
    item: IssueInput,
    transaction: Transaction,
  ): Promise<number[]> {
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
      individuals?: Array<{ name?: string; type?: string | string[] }>;
      appearances?: Array<{ name?: string; type?: string; role?: string }>;
      parent?: StoryParentRef;
    };

    type CrawledCollectedIssueLike = {
      number?: string;
      storyTitle?: string;
      series?: { title?: string; volume?: number };
    };

    type CrawledParentIssueLike = {
      collectedIssues?: CrawledCollectedIssueLike[];
      containedIssues?: CrawledCollectedIssueLike[];
    };

    const rawInputStories = Array.isArray((item as { stories?: unknown[] }).stories)
      ? ((item as { stories?: unknown[] }).stories as unknown[]) || []
      : [];

    const expandCollectedParentStories = async (stories: unknown[]): Promise<StoryInputLike[]> => {
      const expandedStories: StoryInputLike[] = [];

      for (const rawStory of stories) {
        if (!rawStory || typeof rawStory !== 'object') continue;
        const story = rawStory as StoryInputLike;
        const parentTitle = String(story.parent?.issue?.series?.title || '').trim();
        const parentVolume = Number(story.parent?.issue?.series?.volume || 0);
        const parentNumber = String(story.parent?.issue?.number || '').trim();

        if (!parentTitle || parentVolume <= 0 || !parentNumber) {
          expandedStories.push(story);
          continue;
        }

        let crawledParentIssue: CrawledParentIssueLike | null = null;
        try {
          crawledParentIssue = (await this.crawler.crawlIssue(
            parentTitle,
            parentVolume,
            parentNumber,
          )) as CrawledParentIssueLike;
        } catch {
          expandedStories.push(story);
          continue;
        }

        const collectedIssues = Array.isArray(crawledParentIssue.collectedIssues)
          ? crawledParentIssue.collectedIssues
          : Array.isArray(crawledParentIssue.containedIssues)
          ? crawledParentIssue.containedIssues
          : [];

        const normalizedCollectedIssues = collectedIssues
          .map((entry) => ({
            number: String(entry?.number || '').trim(),
            seriesTitle: String(entry?.series?.title || '').trim(),
            seriesVolume: Number(entry?.series?.volume || 0),
          }))
          .filter(
            (entry) =>
              entry.number.length > 0 &&
              entry.seriesTitle.length > 0 &&
              entry.seriesVolume > 0,
          );
        const uniqueCollectedIssues = Array.from(
          new Map(
            normalizedCollectedIssues.map((entry) => [
              `${entry.seriesTitle.toLowerCase()}::${entry.seriesVolume}::${entry.number.toLowerCase()}`,
              entry,
            ]),
          ).values(),
        );

        if (uniqueCollectedIssues.length === 0) {
          expandedStories.push(story);
          continue;
        }

        for (const collectedIssue of uniqueCollectedIssues) {
          expandedStories.push({
            ...story,
            title: String(story.title || ''),
            parent: {
              number: 0,
              issue: {
                number: collectedIssue.number,
                series: {
                  title: collectedIssue.seriesTitle,
                  volume: collectedIssue.seriesVolume,
                },
              },
            },
          });
        }
      }

      return expandedStories;
    };

    const inputStories = await expandCollectedParentStories(rawInputStories);

    const normalizeTypeList = (raw: unknown): string[] => {
      if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0);
      }
      const normalized = String(raw || '').trim();
      return normalized ? [normalized] : [];
    };

    const findOrCreateIndividual = async (rawName: unknown) => {
      const name = String(rawName || '').trim();
      if (!name) return null;
      const [individual] = await this.models.Individual.findOrCreate({
        where: { name },
        defaults: { name },
        transaction,
      });
      return individual;
    };

    const linkStoryIndividuals = async (
      storyId: number,
      individuals: Array<{ name?: string; type?: string | string[] }> = [],
    ) => {
      for (const entry of individuals) {
        const individual = await findOrCreateIndividual(entry?.name);
        if (!individual) continue;

        const types = normalizeTypeList(entry?.type);
        if (types.length === 0) continue;

        for (const type of types) {
          await this.models.Story_Individual.findOrCreate({
            where: {
              fk_story: storyId,
              fk_individual: individual.id,
              type,
            },
            defaults: {
              fk_story: storyId,
              fk_individual: individual.id,
              type,
            },
            transaction,
          });
        }
      }
    };

    const linkStoryAppearances = async (
      storyId: number,
      appearances: Array<{ name?: string; type?: string; role?: string }> = [],
    ) => {
      for (const rawAppearance of appearances) {
        const name = String(rawAppearance?.name || '').trim();
        const type = String(rawAppearance?.type || '').trim();
        const role = String(rawAppearance?.role || '').trim();
        if (!name || !type) continue;

        const [appearance] = await this.models.Appearance.findOrCreate({
          where: { name, type },
          defaults: { name, type },
          transaction,
        });

        await this.models.Story_Appearance.findOrCreate({
          where: {
            fk_story: storyId,
            fk_appearance: appearance.id,
            role,
          },
          defaults: {
            fk_story: storyId,
            fk_appearance: appearance.id,
            role,
          },
          transaction,
        });
      }
    };

    const existingStoriesRaw = await this.models.Story.findAll({
      where: { fk_issue: issueId },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
    });
    const existingStories = Array.isArray(existingStoriesRaw) ? existingStoriesRaw : [];
    const oldParentStoryIds = existingStories
      .map((story) => Number(story.fk_parent || 0))
      .filter((id) => id > 0);
    const oldUsParentStoryIds = await this.filterUsParentStoryIds(oldParentStoryIds, transaction);
    const newlyLinkedParentStoryIds = new Set<number>();

    await this.models.Story.destroy({
      where: { fk_issue: issueId },
      transaction,
    });

    if (inputStories.length === 0) return Array.from(oldUsParentStoryIds);

    let nextStoryNumber = 1;
    const parentIssueCache = new Map<string, Array<{ issueId: number; storyTitle?: string }>>();
    const normalizeStoryTitleKey = (value: unknown): string =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_:;,.!?'"()\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    for (const rawStory of inputStories) {
      if (!rawStory || typeof rawStory !== 'object') continue;
      const story = rawStory as StoryInputLike;
      const parent = story.parent;
      const parentIssue = parent?.issue;
      const parentSeries = parentIssue?.series;

      const parentTitle = String(parentSeries?.title || '').trim();
      const parentVolume = Number(parentSeries?.volume || 0);
      const parentNumber = String(parentIssue?.number || '').trim();
      const requestedStoryNumber = Number(story.number || 0);
      const resolvedStoryNumber = requestedStoryNumber > 0 ? requestedStoryNumber : nextStoryNumber++;
      if (resolvedStoryNumber >= nextStoryNumber) nextStoryNumber = resolvedStoryNumber + 1;
      const createStoryRow = async (parentStoryId: number | null) => {
        if (typeof parentStoryId === 'number' && parentStoryId > 0) {
          newlyLinkedParentStoryIds.add(parentStoryId);
        }
        const createdStory = await this.models.Story.create(
          {
            fk_issue: issueId,
            fk_parent: parentStoryId,
            number: resolvedStoryNumber,
            title: String(story.title || ''),
            addinfo: String(story.addinfo || ''),
            part: String(story.part || ''),
          },
          { transaction },
        );
        await linkStoryIndividuals(createdStory.id, story.individuals || []);
        await linkStoryAppearances(createdStory.id, story.appearances || []);
        return createdStory;
      };

      let hasCreatedStory = false;

      if (parentTitle && parentVolume > 0 && parentNumber) {
        const cacheKey = `${parentTitle}::${parentVolume}::${parentNumber}`;
        let parentIssueRefs = parentIssueCache.get(cacheKey);

        if (!parentIssueRefs) {
          parentIssueRefs = await this.findOrCrawlParentIssues(
            {
              title: parentTitle,
              volume: parentVolume,
              number: parentNumber,
            },
            transaction,
          );
          parentIssueCache.set(cacheKey, parentIssueRefs);
        }
        const parentIssueIds = parentIssueRefs.map((entry) => entry.issueId);

        const parentStories = await this.models.Story.findAll({
          where: {
            fk_issue: parentIssueIds.length === 1 ? parentIssueIds[0] : { [Op.in]: parentIssueIds },
          },
          order: [
            ['fk_issue', 'ASC'],
            ['number', 'ASC'],
            ['id', 'ASC'],
          ],
          transaction,
        });

        const requestedParentStoryNumber = Number(parent?.number || 0);
        const requestedStoryTitle = normalizeStoryTitleKey(story.title);
        const hasResolvedParentStoryTitles = parentIssueRefs.some(
          (entry) => normalizeStoryTitleKey(entry.storyTitle) !== '',
        );
        const matchedParentRefsByTitle =
          requestedStoryTitle === ''
            ? []
            : parentIssueRefs.filter((entry) => normalizeStoryTitleKey(entry.storyTitle) === requestedStoryTitle);
        const matchesResolvedParentStory = (parentStory: { fk_issue?: number; title?: string }) =>
          matchedParentRefsByTitle.some(
            (entry) =>
              entry.issueId === Number(parentStory.fk_issue || 0) &&
              normalizeStoryTitleKey(parentStory.title) === normalizeStoryTitleKey(entry.storyTitle),
          );
        if (requestedParentStoryNumber === 0) {
          let matchingParentStories = parentStories;
          if (matchedParentRefsByTitle.length > 0) {
            matchingParentStories = parentStories.filter((parentStory) =>
              matchesResolvedParentStory(parentStory),
            );
          } else if (requestedStoryTitle === '' && hasResolvedParentStoryTitles) {
            matchingParentStories = parentStories.filter((parentStory) =>
              parentIssueRefs.some(
                (entry) =>
                  entry.issueId === Number(parentStory.fk_issue || 0) &&
                  normalizeStoryTitleKey(entry.storyTitle) === normalizeStoryTitleKey(parentStory.title),
              ),
            );
          }
          for (const parentStory of matchingParentStories) {
            await createStoryRow(parentStory.id);
            hasCreatedStory = true;
          }
        } else {
          const selectedParentStories = parentStories.filter(
            (entry) =>
              Number(entry.number || 0) === requestedParentStoryNumber &&
              (matchedParentRefsByTitle.length === 0 || matchesResolvedParentStory(entry)),
          );
          for (const selectedParentStory of selectedParentStories) {
            await createStoryRow(selectedParentStory.id);
            hasCreatedStory = true;
          }
        }
      }

      if (!hasCreatedStory) await createStoryRow(null);
    }

    return Array.from(oldUsParentStoryIds).filter((id) => !newlyLinkedParentStoryIds.has(id));
  }

  private async filterUsParentStoryIds(
    storyIds: readonly number[],
    transaction: Transaction,
  ): Promise<Set<number>> {
    const numericStoryIds = normalizeDbIds(storyIds);
    if (numericStoryIds.length === 0) return new Set<number>();

    const stories = await this.models.Story.findAll({
      where: { id: { [Op.in]: numericStoryIds } },
      attributes: ['id'],
      include: [
        {
          model: this.models.Issue,
          as: 'issue',
          attributes: ['id'],
          required: true,
          include: [
            {
              model: this.models.Series,
              as: 'series',
              attributes: ['id'],
              required: true,
              include: [
                {
                  model: this.models.Publisher,
                  as: 'publisher',
                  attributes: ['original'],
                  required: true,
                },
              ],
            },
          ],
        },
      ],
      transaction,
    });

    const usStoryIds = new Set<number>();
    for (const story of stories as Array<{
      id?: number;
      issue?: { series?: { publisher?: { original?: boolean } } };
    }>) {
      if (!story.issue?.series?.publisher?.original) continue;
      const storyId = Number(story.id || 0);
      if (storyId > 0) usStoryIds.add(storyId);
    }

    return usStoryIds;
  }

  private async resolveIssueIdsFromStoryIds(
    storyIds: readonly number[],
    transaction: Transaction,
  ): Promise<number[]> {
    const numericStoryIds = normalizeDbIds(storyIds);
    if (numericStoryIds.length === 0) return [];

    const stories = await this.models.Story.findAll({
      where: { id: { [Op.in]: numericStoryIds } },
      attributes: ['fk_issue'],
      transaction,
    });

    return Array.from(
      new Set(stories.map((story) => Number(story.fk_issue || 0)).filter((id) => id > 0)),
    );
  }

  private async findOrCrawlParentIssues(
    parent: { title: string; volume: number; number: string },
    transaction: Transaction,
  ): Promise<Array<{ issueId: number; storyTitle?: string }>> {
    type CrawledNamedType = {
      name?: string;
      type?: string | string[];
    };
    type CrawledArcLike = {
      title?: string;
      type?: string;
    };
    type CrawledAppearanceLike = {
      name?: string;
      type?: string;
      role?: string;
    };
    type CrawledCoverLike = {
      number?: number;
      url?: string;
      individuals?: CrawledNamedType[];
    };
    type CrawledStoryLike = {
      number?: number;
      title?: string;
      addinfo?: string;
      part?: string;
      individuals?: CrawledNamedType[];
      appearances?: CrawledAppearanceLike[];
    };
    type CrawledVariantLike = {
      number?: string;
      legacyNumber?: string;
      format?: string;
      variant?: string;
      releasedate?: string;
      price?: number;
      currency?: string;
      cover?: CrawledCoverLike;
    };
    type CrawledIssueLike = {
      legacyNumber?: string;
      releasedate?: string;
      price?: number;
      currency?: string;
      cover?: CrawledCoverLike;
      stories?: CrawledStoryLike[];
      individuals?: CrawledNamedType[];
      arcs?: CrawledArcLike[];
      variants?: CrawledVariantLike[];
      collectedIssues?: Array<{
        number?: string;
        storyTitle?: string;
        series?: {
          title?: string;
          volume?: number;
        };
      }>;
      containedIssues?: Array<{
        number?: string;
        storyTitle?: string;
        series?: {
          title?: string;
          volume?: number;
        };
      }>;
    };

    const normalizeTypeList = (raw: unknown): string[] => {
      if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry || '').trim()).filter((entry) => entry.length > 0);
      }
      const normalized = String(raw || '').trim();
      return normalized ? [normalized] : [];
    };

    const findOrCreateIndividual = async (rawName: unknown) => {
      const name = String(rawName || '').trim();
      if (!name) return null;
      const [individual] = await this.models.Individual.findOrCreate({
        where: { name },
        defaults: { name },
        transaction,
      });
      return individual;
    };

    const linkIssueIndividuals = async (issueId: number, individuals: CrawledNamedType[]) => {
      for (const entry of individuals) {
        const individual = await findOrCreateIndividual(entry?.name);
        if (!individual) continue;

        const types = normalizeTypeList(entry?.type);
        if (types.length === 0) continue;

        for (const type of types) {
          await this.models.Issue_Individual.findOrCreate({
            where: {
              fk_issue: issueId,
              fk_individual: individual.id,
              type,
            },
            defaults: {
              fk_issue: issueId,
              fk_individual: individual.id,
              type,
            },
            transaction,
          });
        }
      }
    };

    const linkCoverIndividuals = async (coverId: number, individuals: CrawledNamedType[]) => {
      for (const entry of individuals) {
        const individual = await findOrCreateIndividual(entry?.name);
        if (!individual) continue;

        const types = normalizeTypeList(entry?.type);
        if (types.length === 0) continue;

        for (const type of types) {
          await this.models.Cover_Individual.findOrCreate({
            where: {
              fk_cover: coverId,
              fk_individual: individual.id,
              type,
            },
            defaults: {
              fk_cover: coverId,
              fk_individual: individual.id,
              type,
            },
            transaction,
          });
        }
      }
    };

    const linkIssueArcs = async (issueId: number, arcs: CrawledArcLike[]) => {
      for (const rawArc of arcs) {
        const title = String(rawArc?.title || '').trim();
        const type = String(rawArc?.type || '').trim();
        if (!title || !type) continue;

        const [arc] = await this.models.Arc.findOrCreate({
          where: { title, type },
          defaults: { title, type },
          transaction,
        });

        await this.models.Issue_Arc.findOrCreate({
          where: {
            fk_issue: issueId,
            fk_arc: arc.id,
          },
          defaults: {
            fk_issue: issueId,
            fk_arc: arc.id,
          },
          transaction,
        });
      }
    };

    const linkStoryIndividuals = async (storyId: number, individuals: CrawledNamedType[]) => {
      for (const entry of individuals) {
        const individual = await findOrCreateIndividual(entry?.name);
        if (!individual) continue;

        const types = normalizeTypeList(entry?.type);
        if (types.length === 0) continue;

        for (const type of types) {
          await this.models.Story_Individual.findOrCreate({
            where: {
              fk_story: storyId,
              fk_individual: individual.id,
              type,
            },
            defaults: {
              fk_story: storyId,
              fk_individual: individual.id,
              type,
            },
            transaction,
          });
        }
      }
    };

    const linkStoryAppearances = async (storyId: number, appearances: CrawledAppearanceLike[]) => {
      for (const rawAppearance of appearances) {
        const name = String(rawAppearance?.name || '').trim();
        const type = String(rawAppearance?.type || '').trim();
        const role = String(rawAppearance?.role || '').trim();
        if (!name || !type) continue;

        const [appearance] = await this.models.Appearance.findOrCreate({
          where: { name, type },
          defaults: { name, type },
          transaction,
        });

        await this.models.Story_Appearance.findOrCreate({
          where: {
            fk_story: storyId,
            fk_appearance: appearance.id,
            role,
          },
          defaults: {
            fk_story: storyId,
            fk_appearance: appearance.id,
            role,
          },
          transaction,
        });
      }
    };

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
          as: 'publisher',
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
        variant: '',
        fk_series: series.id,
      },
      transaction,
    });

    if (!issue) {
      const crawledIssue = (await this.crawler.crawlIssue(
        title,
        volume,
        number,
      )) as CrawledIssueLike;
      const normalizedCollectedIssues = Array.isArray(crawledIssue.collectedIssues)
        ? crawledIssue.collectedIssues
            .map((entry) => ({
              number: String(entry?.number || '').trim(),
              storyTitle: String(entry?.storyTitle || '').trim(),
              seriesTitle: String(entry?.series?.title || '').trim(),
              seriesVolume: Number(entry?.series?.volume || 0),
            }))
            .filter((entry) => entry.number && entry.seriesTitle && entry.seriesVolume > 0)
        : Array.isArray(crawledIssue.containedIssues)
        ? crawledIssue.containedIssues
            .map((entry) => ({
              number: String(entry?.number || '').trim(),
              storyTitle: String(entry?.storyTitle || '').trim(),
              seriesTitle: String(entry?.series?.title || '').trim(),
              seriesVolume: Number(entry?.series?.volume || 0),
            }))
            .filter((entry) => entry.number && entry.seriesTitle && entry.seriesVolume > 0)
        : [];

      if (normalizedCollectedIssues.length > 0) {
        const containedIssueRefs: Array<{ issueId: number; storyTitle?: string }> = [];
        const seenContainedIssueRefs = new Set<string>();
        for (const containedIssue of normalizedCollectedIssues) {
          const resolvedIssueRefs = await this.findOrCrawlParentIssues(
            {
              title: containedIssue.seriesTitle,
              volume: containedIssue.seriesVolume,
              number: containedIssue.number,
            },
            transaction,
          );
          for (const resolvedIssueRef of resolvedIssueRefs) {
            const resolvedStoryTitle = containedIssue.storyTitle || resolvedIssueRef.storyTitle;
            if (resolvedStoryTitle) {
              const key = `${resolvedIssueRef.issueId}::${resolvedStoryTitle.toLowerCase()}`;
              if (seenContainedIssueRefs.has(key)) continue;
              seenContainedIssueRefs.add(key);
              containedIssueRefs.push({
                issueId: resolvedIssueRef.issueId,
                storyTitle: resolvedStoryTitle,
              });
              continue;
            }

            const key = `${resolvedIssueRef.issueId}::`;
            if (seenContainedIssueRefs.has(key)) continue;
            seenContainedIssueRefs.add(key);
            containedIssueRefs.push({ issueId: resolvedIssueRef.issueId });
          }
        }
        return containedIssueRefs;
      }

      issue = await this.models.Issue.create(
        {
          title: '',
          number,
          format: 'Heft',
          variant: '',
          releasedate: coerceReleaseDateForDb(crawledIssue.releasedate),
          legacy_number: String(crawledIssue.legacyNumber || ''),
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

      const mainCover = crawledIssue.cover || {
        number: 0,
        url: '',
        individuals: [],
      };

      const [createdMainCover] = await this.models.Cover.findOrCreate({
        where: {
          fk_issue: issue.id,
          fk_parent: null,
          number: Number(mainCover.number || 0),
        },
        defaults: {
          fk_issue: issue.id,
          number: Number(mainCover.number || 0),
          url: String(mainCover.url || ''),
          addinfo: '',
        },
        transaction,
      });
      if (!createdMainCover.url && mainCover.url) {
        createdMainCover.url = String(mainCover.url || '');
        await createdMainCover.save({ transaction });
      }

      await linkCoverIndividuals(createdMainCover.id, mainCover.individuals || []);
      await linkIssueIndividuals(issue.id, crawledIssue.individuals || []);
      await linkIssueArcs(issue.id, crawledIssue.arcs || []);

      for (const crawledStory of crawledIssue.stories || []) {
        const createdStory = await this.models.Story.create(
          {
            fk_issue: issue.id,
            number: Number(crawledStory.number || 0) || 1,
            title: String(crawledStory.title || ''),
            addinfo: String(crawledStory.addinfo || ''),
            part: String(crawledStory.part || ''),
          },
          { transaction },
        );
        await linkStoryIndividuals(createdStory.id, crawledStory.individuals || []);
        await linkStoryAppearances(createdStory.id, crawledStory.appearances || []);
      }

      for (const crawledVariant of crawledIssue.variants || []) {
        const variantNumber = String(crawledVariant.number || issue.number || number).trim();
        const variantName = String(crawledVariant.variant || '').trim();
        if (!variantName) continue;

        const [variantIssue] = await this.models.Issue.findOrCreate({
          where: {
            number: variantNumber,
            variant: variantName,
            fk_series: series.id,
          },
          defaults: {
            title: '',
            number: variantNumber,
            format: String(crawledVariant.format || issue.format || 'Heft'),
            variant: variantName,
            releasedate: coerceReleaseDateForDb(
              crawledVariant.releasedate || issue.releasedate || crawledIssue.releasedate || '',
            ),
            legacy_number: String(crawledVariant.legacyNumber || crawledIssue.legacyNumber || ''),
            pages: 0,
            price: Number(crawledVariant.price || 0),
            currency: String(crawledVariant.currency || crawledIssue.currency || 'USD'),
            comicguideid: '0',
            isbn: '',
            limitation: normalizeLimitationForDb(undefined),
            addinfo: '',
            fk_series: series.id,
          },
          transaction,
        });

        const variantCover = crawledVariant.cover;
        if (!variantCover) continue;

        const [createdVariantCover] = await this.models.Cover.findOrCreate({
          where: {
            fk_issue: variantIssue.id,
            fk_parent: null,
            number: Number(variantCover.number || 0),
          },
          defaults: {
            fk_issue: variantIssue.id,
            number: Number(variantCover.number || 0),
            url: String(variantCover.url || ''),
            addinfo: '',
          },
          transaction,
        });

        if (!createdVariantCover.url && variantCover.url) {
          createdVariantCover.url = String(variantCover.url || '');
          await createdVariantCover.save({ transaction });
        }

        await linkCoverIndividuals(createdVariantCover.id, variantCover.individuals || []);
      }
    }

    return [{ issueId: issue.id }];
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
    type IssueIdRow = { id: number | string; fk_series?: unknown; number?: unknown };
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
        as: 'series',
        required: true,
        include: [{ model: this.models.Publisher, as: 'publisher' }],
      },
    ];
    const orderBy =
      sortField === 'series'
        ? ([
            [{ model: this.models.Series, as: 'series' }, 'title', sortDirection],
            [{ model: this.models.Series, as: 'series' }, 'volume', sortDirection],
            ['id', sortDirection],
          ] as FindOptions['order'])
        : sortField === 'publisher'
          ? ([
              [
                { model: this.models.Series, as: 'series' },
                { model: this.models.Publisher, as: 'publisher' },
                'name',
                sortDirection,
              ],
              [{ model: this.models.Series, as: 'series' }, 'title', sortDirection],
              [{ model: this.models.Series, as: 'series' }, 'volume', sortDirection],
              ['id', sortDirection],
            ] as FindOptions['order'])
          : ([
              [sortField, sortDirection],
              ['id', sortDirection],
            ] as FindOptions['order']);

    const normalizedFilter = normalizeLastEditedFilter(filter);

    if (normalizedFilter) {
      const { FilterService } = require('./FilterService');
      const filterService = new FilterService(this.models, this.requestId);
      const filterOptions = filterService.getFilterOptions(loggedIn, normalizedFilter);

      const filterWhere = (filterOptions.where || {}) as WhereMap;
      Object.assign(where, filterWhere);
      where.fk_series = { [Op.ne]: null };

      if (filterOptions.include) {
        include = filterOptions.include;
      }
    }

    const options: FindOptions = {
      order: orderBy,
      limit: limit + 1,
      where,
      include,
      subQuery: false,
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

    // Phase 1: fetch only ids with full filter/sort/cursor logic to avoid wide row payload.
    const idScanLimit = Math.min((limit + 1) * 5, 250);
    const idRows = (await this.models.Issue.findAll({
      ...options,
      attributes: ['id', 'fk_series', 'number'],
      limit: idScanLimit,
    })) as unknown as IssueIdRow[];

    const orderedUniqueIds: number[] = [];
    const seenGroups = new Set<string>();
    idRows.forEach((row) => {
      const idKey = toIdKey((row as { id?: unknown })?.id);
      if (!idKey) return;

      const groupKey = toSeriesNumberGroupKey({
        fk_series: (row as { fk_series?: unknown }).fk_series,
        number: (row as { number?: unknown }).number,
      });
      const dedupeKey = groupKey || `id::${idKey}`;
      if (seenGroups.has(dedupeKey)) return;

      seenGroups.add(dedupeKey);
      orderedUniqueIds.push(Number(idKey));
    });

    const pageIds = orderedUniqueIds.slice(0, limit + 1);
    if (pageIds.length === 0) {
      return buildConnectionFromNodes([], limit, after || undefined);
    }

    // Phase 2: hydrate selected issues with lightweight base include.
    const hydratedIssues = await this.models.Issue.findAll({
      where: { id: { [Op.in]: pageIds } },
      include: [
        {
          model: this.models.Series,
          as: 'series',
          required: true,
          include: [{ model: this.models.Publisher, as: 'publisher' }],
        },
      ],
    });

    const issuesById = new Map<string, (typeof hydratedIssues)[number]>();
    hydratedIssues.forEach((issue) => {
      const idKey = toIdKey(issue.id);
      if (idKey) issuesById.set(idKey, issue);
    });

    const orderedResults = pageIds
      .map((id) => issuesById.get(String(id)))
      .filter((issue): issue is (typeof hydratedIssues)[number] => Boolean(issue));

    const siblingGroups = new Map<string, { fkSeries: number; number: string }>();
    for (const issue of orderedResults) {
      const groupKey = toSeriesNumberGroupKey(issue as { fk_series?: unknown; number?: unknown });
      const seriesIdKey = toIdKey(issue.fk_series);
      const number = String(issue.number ?? '').trim();
      if (!groupKey || !seriesIdKey || number === '') continue;
      if (!siblingGroups.has(groupKey)) {
        siblingGroups.set(groupKey, { fkSeries: Number(seriesIdKey), number });
      }
    }

    const siblingWhere = [...siblingGroups.values()].map(({ fkSeries, number }) => ({
      fk_series: fkSeries,
      number,
    }));

    const siblings =
      siblingWhere.length > 0
        ? await this.models.Issue.findAll({
            where: { [Op.or]: siblingWhere },
            attributes: ['id', 'fk_series', 'number', 'format', 'variant', 'comicguideid'],
          })
        : [];

    const preferredByGroup = new Map<
      string,
      {
        id?: number | null;
        format?: string | null;
        variant?: string | null;
        comicguideid?: string | null;
      }
    >();
    const siblingsByGroup = new Map<string, typeof siblings>();
    for (const sibling of siblings) {
      const key = toSeriesNumberGroupKey(sibling as { fk_series?: unknown; number?: unknown });
      if (!key) continue;
      const grouped = siblingsByGroup.get(key);
      if (grouped) grouped.push(sibling);
      else siblingsByGroup.set(key, [sibling]);
    }

    for (const [key, grouped] of siblingsByGroup) {
      const preferred = pickPreferredIssueVariant(grouped);
      if (!preferred) continue;
      preferredByGroup.set(key, {
        id: toNumericId((preferred as { id?: unknown }).id),
        format: (preferred as { format?: string | null }).format ?? null,
        variant: (preferred as { variant?: string | null }).variant ?? null,
        comicguideid: String((preferred as { comicguideid?: unknown }).comicguideid ?? ''),
      });
    }

    orderedResults.forEach((issue) => {
      const key = toSeriesNumberGroupKey(issue as { fk_series?: unknown; number?: unknown });
      if (!key) return;
      const preferred = preferredByGroup.get(key);
      if (!preferred) return;

      issue.format = preferred.format ?? issue.format;
      issue.variant = preferred.variant ?? issue.variant;
      (
        issue as typeof issue & {
          __coverIssueId?: number | null;
          __coverComicguideId?: string | null;
        }
      ).__coverIssueId = preferred.id ?? null;
      (
        issue as typeof issue & {
          __coverIssueId?: number | null;
          __coverComicguideId?: string | null;
        }
      ).__coverComicguideId = preferred.comicguideid ?? null;
    });

    return buildConnectionFromNodes(orderedResults, limit, after || undefined);
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
    const dbIssueIds = normalizeDbIds(issueIds as unknown as readonly unknown[]);
    const covers = await this.models.Cover.findAll({
      where: {
        fk_issue: { [Op.in]: dbIssueIds },
        fk_parent: null,
      },
      order: [
        ['fk_issue', 'ASC'],
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
    });
    return issueIds.map((issueId) => {
      const issueIdKey = toIdKey(issueId);
      if (!issueIdKey) return null;
      return covers.find((cover) => toIdKey(cover.fk_issue) === issueIdKey) || null;
    });
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
      order: [['id', 'ASC']],
    });

    return parsedKeys.map(({ fkSeries, number }) =>
      sortIssueVariants(
        variants.filter((variant) => variant.fk_series === fkSeries && variant.number === number),
      ),
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
            order: [['id', 'ASC']],
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
      const siblingsForIssue = siblingsByKey.get(`${fkSeriesKey}::${base.number}`) || [];
      return sortIssueVariants(siblingsForIssue);
    });
  }

  private async resolveIssueByIdentity(
    issue: IssueInput,
    transaction: Transaction,
  ): Promise<{ id: number } | null> {
    const issueId = Number((issue as { id?: unknown })?.id);
    if (Number.isFinite(issueId) && issueId > 0) {
      const byId = (await this.models.Issue.findByPk(Math.trunc(issueId), {
        attributes: ['id'],
        transaction,
      })) as { id?: number } | null;
      if (byId?.id) return { id: byId.id };
    }

    const publisher = await this.models.Publisher.findOne({
      where: { name: (issue.series?.publisher?.name || '').trim() },
      transaction,
    });
    if (!publisher) return null;

    const series = await this.models.Series.findOne({
      where: {
        title: (issue.series?.title || '').trim(),
        volume: issue.series?.volume,
        fk_publisher: publisher.id,
      },
      transaction,
    });
    if (!series) return null;

    const where: Record<string, unknown> = {
      number: (issue.number || '').trim(),
      variant: (issue.variant || '').trim(),
      fk_series: series.id,
    };
    const format = typeof issue.format === 'string' ? issue.format.trim() : '';
    if (format !== '') where.format = format;

    const resolved = (await this.models.Issue.findOne({
      where,
      transaction,
    })) as { id?: number } | null;
    if (!resolved?.id) return null;
    return { id: resolved.id };
  }

  private async loadIssueForChangeRequest(
    issueId: number,
    transaction?: Transaction,
  ): Promise<Record<string, unknown> | null> {
    const row = (await this.models.Issue.findByPk(issueId, {
      include: [
        {
          model: this.models.Series,
          as: 'series',
          include: [{ model: this.models.Publisher, as: 'publisher' }],
        },
        {
          model: this.models.Story,
          as: 'stories',
          include: [
            { model: this.models.Individual, as: 'individuals' },
            { model: this.models.Appearance, as: 'appearances' },
            {
              model: this.models.Story,
              as: 'parent',
              include: [
                {
                  model: this.models.Issue,
                  as: 'issue',
                  include: [
                    {
                      model: this.models.Series,
                      as: 'series',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      transaction,
    })) as unknown as
      | {
          title?: unknown;
          number?: unknown;
          format?: unknown;
          variant?: unknown;
          releasedate?: unknown;
          pages?: unknown;
          price?: unknown;
          currency?: unknown;
          isbn?: unknown;
          limitation?: unknown;
          comicguideid?: unknown;
          addinfo?: unknown;
          series?: {
            title?: unknown;
            volume?: unknown;
            startyear?: unknown;
            publisher?: { name?: unknown; us?: unknown };
          };
          stories?: Array<{
            id?: unknown;
            title?: unknown;
            addinfo?: unknown;
            part?: unknown;
            number?: unknown;
            exclusive?: unknown;
            individuals?: Array<{ name?: unknown; type?: unknown }>;
            appearances?: Array<{ name?: unknown; type?: unknown; role?: unknown }>;
            parent?: {
              title?: unknown;
              number?: unknown;
              issue?: {
                number?: unknown;
                series?: {
                  title?: unknown;
                  volume?: unknown;
                };
              };
            };
          }>;
        }
      | null;

    if (!row) return null;

    const stories = Array.isArray(row.stories) ? [...row.stories] : [];
    stories.sort((a, b) => Number(a.number || 0) - Number(b.number || 0));

    return {
      id: Number((row as { id?: unknown }).id || issueId),
      title: normalizeString(row.title),
      number: normalizeString(row.number),
      format: normalizeString(row.format),
      variant: normalizeString(row.variant),
      releasedate: normalizeIssueReleaseDate(row.releasedate),
      pages: Number(row.pages || 0),
      price: Number(row.price || 0),
      currency: normalizeString(row.currency),
      isbn: normalizeString(row.isbn),
      limitation: normalizeString(row.limitation),
      comicguideid: Number(row.comicguideid || 0),
      addinfo: normalizeString(row.addinfo),
      series: {
        title: normalizeString(row.series?.title),
        volume: Number(row.series?.volume || 0),
        startyear: Number(row.series?.startyear || 0),
        publisher: {
          name: normalizeString(row.series?.publisher?.name),
          us: Boolean(row.series?.publisher?.us),
        },
      },
      stories: stories.map((story) => {
        const parent = story.parent;
        const parentIssue = parent?.issue;
        const parentSeries = parentIssue?.series;
        const mapped: Record<string, unknown> = {
          title: normalizeString(story.title),
          addinfo: normalizeString(story.addinfo),
          part: normalizeString(story.part),
          number: Number(story.number || 0),
          exclusive: Boolean(story.exclusive) && !parent,
          individuals: Array.isArray(story.individuals)
            ? story.individuals.map((entry) => ({
                name: normalizeString(entry?.name),
                type: Array.isArray(entry?.type)
                  ? entry?.type
                  : normalizeString(entry?.type)
                    ? [normalizeString(entry?.type)]
                    : [],
              }))
            : [],
          appearances: Array.isArray(story.appearances)
            ? story.appearances.map((entry) => ({
                name: normalizeString(entry?.name),
                type: normalizeString(entry?.type),
                role: normalizeString(entry?.role),
              }))
            : [],
        };

        if (parent) {
          mapped.parent = {
            title: normalizeString(parent.title),
            number: Number(parent.number || 0),
            issue: parentIssue
              ? {
                  number: normalizeString(parentIssue.number),
                  series: parentSeries
                    ? {
                        title: normalizeString(parentSeries.title),
                        volume: Number(parentSeries.volume || 0),
                      }
                    : undefined,
                }
              : undefined,
          };
        }

        return mapped;
      }),
    };
  }
}

type DiffEntry = {
  path: string;
  from: unknown;
  to: unknown;
};

const normalizeForDiff = (value: unknown): unknown => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForDiff(entry));
  }

  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      normalized[key] = normalizeForDiff(input[key]);
    }
    return normalized;
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
};

const extractChangeRequestItem = (value: unknown): Record<string, unknown> | null => {
  const payload = asRecord(value);
  if (!payload) return null;

  const wrappedItem = asRecord(payload.item);
  if (wrappedItem) return wrappedItem;

  if (hasOwn(payload, 'item')) return null;
  return payload;
};

const mergeRecords = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key];

    if (Array.isArray(patchValue)) {
      merged[key] = patchValue;
      continue;
    }

    if (
      isPlainObject(baseValue) &&
      isPlainObject(patchValue)
    ) {
      merged[key] = mergeRecords(baseValue, patchValue);
      continue;
    }

    merged[key] = patchValue;
  }

  return merged;
};

const resolveChangeRequestItem = (
  value: unknown,
  issue: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  const changeItem = extractChangeRequestItem(value);
  if (!changeItem && !issue) return null;
  if (!changeItem) return issue ? (normalizeForDiff(issue) as Record<string, unknown>) : null;
  if (!issue) return normalizeForDiff(changeItem) as Record<string, unknown>;

  return normalizeForDiff(mergeRecords(issue, changeItem)) as Record<string, unknown>;
};

const normalizeChangeRequestPayload = (
  value: unknown,
  issue: Record<string, unknown> | null,
): Record<string, unknown> => {
  const payload = asRecord(value) || {};
  const normalizedItem = resolveChangeRequestItem(payload, issue) || {};

  const nextPayload: Record<string, unknown> = {
    ...payload,
    item: normalizedItem,
  };

  if (issue) nextPayload.issue = issue;
  return nextPayload;
};

const buildDiffEntries = (base: unknown, next: unknown): DiffEntry[] => {
  const diffs: DiffEntry[] = [];
  diffValues(base, next, '', diffs);
  return diffs;
};

const diffValues = (base: unknown, next: unknown, path: string, diffs: DiffEntry[]) => {
  if (isEqualValue(base, next)) return;

  const baseIsArray = Array.isArray(base);
  const nextIsArray = Array.isArray(next);
  if (baseIsArray || nextIsArray) {
    const baseArray = baseIsArray ? (base as unknown[]) : [];
    const nextArray = nextIsArray ? (next as unknown[]) : [];
    const max = Math.max(baseArray.length, nextArray.length);
    for (let i = 0; i < max; i += 1) {
      diffValues(baseArray[i], nextArray[i], appendDiffPath(path, `[${i}]`), diffs);
    }
    return;
  }

  const baseIsObject = isPlainObject(base);
  const nextIsObject = isPlainObject(next);
  if (baseIsObject && nextIsObject) {
    const baseRecord = base as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(nextRecord)]);
    for (const key of Array.from(keys).sort()) {
      diffValues(baseRecord[key], nextRecord[key], appendDiffPath(path, key), diffs);
    }
    return;
  }

  diffs.push({
    path: path || '(root)',
    from: base,
    to: next,
  });
};

const appendDiffPath = (base: string, key: string): string => {
  if (!base) return key;
  if (key.startsWith('[')) return `${base}${key}`;
  return `${base}.${key}`;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isEqualValue = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  return Number.isNaN(left) && Number.isNaN(right);
};

const determineChangeRequestType = (diffs: DiffEntry[]): ChangeRequestType => {
  const changedPaths = diffs.map((diff) => diff.path);

  if (changedPaths.some((path) => path.startsWith('series.publisher'))) {
    return 'PUBLISHER';
  }
  if (changedPaths.some((path) => path.startsWith('series.'))) {
    return 'SERIES';
  }
  return 'ISSUE';
};
