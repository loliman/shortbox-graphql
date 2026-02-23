import models from '../models';
import { FindOptions, Op, Transaction } from 'sequelize';
import logger from '../util/logger';
import type { Filter, IssueInput, SeriesInput } from '@loliman/shortbox-contract';
import { buildConnectionFromNodes, decodeCursorId } from '../core/cursor';
import { naturalCompare } from '../util/util';
import { fromRoman } from '../util/dbFunctions';
import { MarvelCrawlerService } from './MarvelCrawlerService';
import { updateStoryFilterFlagsForIssue } from '../util/FilterUpdater';

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
  PARENT_FORMATS.has(
    String(issue.format ?? '')
      .trim()
      .toUpperCase(),
  ) && String(issue.variant ?? '').trim() === '';

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

    let res = await this.models.Issue.findOne({
      where: {
        number: (old.number || '').trim(),
        variant: (old.variant || '').trim(),
        fk_series: oldSeries.id,
      },
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
    return savedIssue;
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
      parent?: StoryParentRef;
    };

    const inputStories = Array.isArray((item as { stories?: unknown[] }).stories)
      ? ((item as { stories?: unknown[] }).stories as unknown[]) || []
      : [];

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

    if (inputStories.length === 0) return Array.from(oldUsParentStoryIds);

    let nextStoryNumber = 1;
    const parentIssueCache = new Map<string, number>();

    for (const rawStory of inputStories) {
      if (!rawStory || typeof rawStory !== 'object') continue;
      const story = rawStory as StoryInputLike;
      const sourceStoryNumber = Number(story.number || 0);
      const fallbackParentCandidates =
        sourceStoryNumber > 0 ? existingParentsByNumber.get(sourceStoryNumber) || [] : [];
      const fallbackParentId =
        fallbackParentCandidates.length > 0 ? (fallbackParentCandidates.shift() ?? null) : null;
      const parent = story.parent;
      const parentIssue = parent?.issue;
      const parentSeries = parentIssue?.series;

      const parentTitle = String(parentSeries?.title || '').trim();
      const parentVolume = Number(parentSeries?.volume || 0);
      const parentNumber = String(parentIssue?.number || '').trim();
      const createStoryRow = async (parentStoryId: number | null) => {
        if (typeof parentStoryId === 'number' && parentStoryId > 0) {
          newlyLinkedParentStoryIds.add(parentStoryId);
        }
        return await this.models.Story.create(
          {
            fk_issue: issueId,
            fk_parent: parentStoryId,
            number: nextStoryNumber++,
            title: String(story.title || ''),
            addinfo: String(story.addinfo || ''),
            part: String(story.part || ''),
          },
          { transaction },
        );
      };

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

  private async findOrCrawlParentIssue(
    parent: { title: string; volume: number; number: string },
    transaction: Transaction,
  ): Promise<number> {
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
      format?: string;
      variant?: string;
      releasedate?: string;
      price?: number;
      currency?: string;
      cover?: CrawledCoverLike;
    };
    type CrawledIssueLike = {
      releasedate?: string;
      price?: number;
      currency?: string;
      coverUrl?: string;
      cover?: CrawledCoverLike;
      stories?: CrawledStoryLike[];
      individuals?: CrawledNamedType[];
      arcs?: CrawledArcLike[];
      variants?: CrawledVariantLike[];
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

      const mainCover = crawledIssue.cover || {
        number: 0,
        url: crawledIssue.coverUrl || '',
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
            releasedate: String(
              crawledVariant.releasedate || issue.releasedate || crawledIssue.releasedate || '',
            ),
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
    type IssueIdRow = { id: number | string };
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
      attributes: ['id'],
      limit: idScanLimit,
    })) as unknown as IssueIdRow[];

    const orderedUniqueIds: number[] = [];
    const seenIds = new Set<string>();
    idRows.forEach((row) => {
      const idKey = toIdKey((row as { id?: unknown })?.id);
      if (!idKey || seenIds.has(idKey)) return;
      seenIds.add(idKey);
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
    const covers = await this.models.Cover.findAll({
      where: {
        fk_issue: { [Op.in]: [...issueIds] },
        number: 0,
      },
      order: [['id', 'ASC']],
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
