import { Op, Transaction } from 'sequelize';
import models from '../models';
import logger from '../util/logger';
import {
  CrawledAppearance,
  CrawledArc,
  CrawledIssue,
  CrawledSeries,
  MarvelCrawlerService,
} from '../services/MarvelCrawlerService';

type ReimportScope =
  | { kind: 'all-us' }
  | { kind: 'publisher'; publisherId: number }
  | { kind: 'series'; seriesId: number }
  | { kind: 'issue'; issueId: number };

export type ReimportRunOptions = {
  dryRun?: boolean;
  scope?: ReimportScope;
};

export type ReimportIssueStatus = 'updated' | 'skipped' | 'manual' | 'failed';

export type ReimportIssueReport = {
  issueId: number;
  status: ReimportIssueStatus;
  label: string;
  notes: string[];
  warnings: string[];
  conflicts: string[];
  changes: string[];
  changeBuckets: {
    dataHygiene: string[];
    structure: string[];
    contentSync: string[];
    other: string[];
  };
  storyCount?: {
    local: number;
    crawled: number;
  };
};

export type ReimportReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  scope: ReimportScope;
  result: {
    changedPublishers: number;
    changedSeries: number;
    changedIssues: number;
    normalizedIssues: number;
    updatedIssues: number;
    conflictIssues: number;
    failedIssues: number;
    conflictSeries: number;
    failedSeries: number;
    failedPublishers: number;
  };
};

type SeriesWithPublisher = {
  id: number;
  title: string;
  volume: number;
  fk_publisher: number;
  startyear: number;
  endyear: number;
  publisher?: {
    id: number;
    name: string;
    original: boolean;
  };
};

type IssueWithSeries = {
  id: number;
  number: string;
  variant: string;
  releasedate: string;
  price: number;
  currency: string;
  format: string;
  fk_series: number;
  series?: SeriesWithPublisher;
};

type SeriesCandidate = {
  key: string;
  title: string;
  volume: number;
  publisherName: string;
  startyear: number;
  endyear: number;
};

type PublisherCandidate = {
  key: string;
  name: string;
};

type PrefetchedIssueCrawl = {
  crawledSeries: CrawledSeries | null;
  crawledIssue: CrawledIssueWithSeries | null;
  seriesCrawlError: Error | null;
  issueCrawlError: Error | null;
};

type StoryRow = {
  id: number;
  number: number;
  title: string;
};

type MainCoverRow = {
  id: number;
  url: string;
  number: number;
};

type CrawledVariantLike = {
  number?: string;
  format?: string;
  variant?: string;
  releasedate?: string;
  price?: number;
  currency?: string;
  cover?: {
    number?: number;
    url?: string;
    individuals?: Array<{ name?: string; type?: string | string[] }>;
  };
};

type CrawledIssueWithSeries = CrawledIssue & {
  seriesTitle?: string;
  seriesVolume?: number;
  seriesPublisherName?: string;
  seriesStartyear?: number;
  seriesEndyear?: number;
};

const defaultScope: ReimportScope = { kind: 'all-us' };
const ISSUE_BATCH_SIZE = 25;
const ENTITY_BATCH_SIZE = 25;
const DRY_RUN_ALL_US_LIMIT = 100;

const normalizeDryRun = (options?: ReimportRunOptions): boolean => {
  if (typeof options?.dryRun === 'boolean') return options.dryRun;
  return String(process.env.REIMPORT_DRY_RUN || 'false').toLowerCase() === 'true';
};

const normalizeString = (value: unknown): string => String(value || '').trim();
const normalizeLower = (value: unknown): string => normalizeString(value).toLowerCase();

const normalizeTypeList = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((entry) => normalizeString(entry)).filter((entry) => entry.length > 0);
  }
  const value = normalizeString(raw);
  return value ? [value] : [];
};

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const toPositiveInt = (value: unknown): number | null => {
  const normalized = toInt(value);
  return normalized > 0 ? normalized : null;
};

const dateOnly = (value: unknown): string => {
  const raw = normalizeString(value);
  if (!raw) return '';
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const slashMatch = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    const [, year, month, day] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const normalizePrice = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
};

const normalizeLimitationForDb = (value: unknown): string => {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  const trimmed = String(value).trim();
  if (!trimmed) return '0';
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? String(parsed) : '0';
};

type ChangeBuckets = {
  dataHygiene: string[];
  structure: string[];
  contentSync: string[];
  other: string[];
};

const createEmptyChangeBuckets = (): ChangeBuckets => ({
  dataHygiene: [],
  structure: [],
  contentSync: [],
  other: [],
});

const classifyChangeBucket = (change: string): keyof ChangeBuckets => {
  const normalized = normalizeLower(change);
  if (
    normalized.includes('normalized ') ||
    normalized.includes('invalid ') ||
    normalized.includes('cleanup ') ||
    normalized.includes('to original=true')
  ) {
    return 'dataHygiene';
  }
  if (
    normalized.includes('created publisher') ||
    normalized.includes('created series') ||
    normalized.includes('moved issue to series') ||
    normalized.includes('created variant issue') ||
    normalized.includes('removed obsolete variant') ||
    normalized.includes('updated series ')
  ) {
    return 'structure';
  }
  if (
    normalized.includes('synchronized ') ||
    normalized.includes('updated release date') ||
    normalized.includes('updated price') ||
    normalized.includes('updated currency')
  ) {
    return 'contentSync';
  }
  return 'other';
};

const bucketizeChanges = (changes: string[]): ChangeBuckets => {
  const buckets = createEmptyChangeBuckets();
  for (const change of changes) {
    const bucket = classifyChangeBucket(change);
    buckets[bucket].push(change);
  }
  return buckets;
};

const countMatchingChanges = (changes: string[], patterns: string[]): number => {
  return changes.filter((change) => {
    const normalized = normalizeLower(change);
    return patterns.some((pattern) => normalized.includes(pattern));
  }).length;
};

const chunkBySize = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const listDiff = (current: Set<string>, next: Set<string>): { add: string[]; remove: string[] } => {
  const add: string[] = [];
  const remove: string[] = [];

  for (const value of next) {
    if (!current.has(value)) add.push(value);
  }
  for (const value of current) {
    if (!next.has(value)) remove.push(value);
  }

  return { add, remove };
};

const buildIssueLabel = (issue: IssueWithSeries): string => {
  const seriesTitle = normalizeString(issue.series?.title) || '?';
  const volume = toInt(issue.series?.volume);
  const number = normalizeString(issue.number) || '?';
  const variant = normalizeString(issue.variant);
  return `${seriesTitle} (Vol. ${volume}) #${number}${variant ? ` [${variant}]` : ''}`;
};

const findOrCreatePublisher = async (publisherName: string, transaction: Transaction) => {
  const normalizedName = normalizeString(publisherName) || 'Marvel Comics';
  const [publisher, created] = await models.Publisher.findOrCreate({
    where: { name: normalizedName },
    defaults: {
      name: normalizedName,
      original: true,
      addinfo: '',
      startyear: 0,
      endyear: 0,
    },
    transaction,
  });

  let updatedOriginal = false;
  if (!publisher.original) {
    publisher.original = true;
    await publisher.save({ transaction });
    updatedOriginal = true;
  }

  return { publisher, created, updatedOriginal };
};

const resolveTargetSeriesData = (
  localIssue: IssueWithSeries,
  crawledSeries: CrawledSeries | null,
  crawledIssue: CrawledIssueWithSeries | null,
): {
  title: string;
  volume: number;
  startyear: number;
  endyear: number;
  publisherName: string;
} => {
  const fallbackTitle = normalizeString(localIssue.series?.title);
  const fallbackVolume = toInt(localIssue.series?.volume);
  const fallbackPublisherName =
    normalizeString(localIssue.series?.publisher?.name) || 'Marvel Comics';
  const fallbackStart = toInt(localIssue.series?.startyear);
  const fallbackEnd = toInt(localIssue.series?.endyear);

  return {
    title:
      normalizeString(crawledIssue?.seriesTitle) ||
      normalizeString(crawledSeries?.title) ||
      fallbackTitle,
    volume: toInt(crawledIssue?.seriesVolume) || toInt(crawledSeries?.volume) || fallbackVolume,
    startyear:
      toInt(crawledIssue?.seriesStartyear) || toInt(crawledSeries?.startyear) || fallbackStart,
    endyear: toInt(crawledIssue?.seriesEndyear) || toInt(crawledSeries?.endyear) || fallbackEnd,
    publisherName:
      normalizeString(crawledIssue?.seriesPublisherName) ||
      normalizeString(crawledSeries?.publisherName) ||
      fallbackPublisherName,
  };
};

const syncIssueIndividuals = async (
  issueId: number,
  crawledIndividuals: Array<{ name?: string; type?: string | string[] }>,
  transaction: Transaction,
): Promise<{ changed: boolean }> => {
  const rows = (await models.Issue_Individual.findAll({
    where: { fk_issue: issueId },
    attributes: ['fk_individual', 'type'],
    transaction,
    raw: true,
  })) as unknown as Array<{ fk_individual: number; type: string }>;

  const current = new Set(rows.map((row) => `${row.fk_individual}::${normalizeString(row.type)}`));

  const desiredNames = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    desiredNames.add(name);
  }

  const desiredIndividuals = new Map<string, number>();
  for (const name of desiredNames) {
    const [individual] = await models.Individual.findOrCreate({
      where: { name },
      defaults: { name },
      transaction,
    });
    desiredIndividuals.set(name, individual.id);
  }

  const next = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    const individualId = desiredIndividuals.get(name);
    if (!individualId) continue;
    for (const type of normalizeTypeList(entry?.type)) {
      next.add(`${individualId}::${type}`);
    }
  }

  const diff = listDiff(current, next);

  for (const key of diff.remove) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Issue_Individual.destroy({
      where: {
        fk_issue: issueId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  for (const key of diff.add) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Issue_Individual.findOrCreate({
      where: {
        fk_issue: issueId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      defaults: {
        fk_issue: issueId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  return { changed: diff.add.length > 0 || diff.remove.length > 0 };
};

const syncIssueArcs = async (
  issueId: number,
  crawledArcs: CrawledArc[],
  transaction: Transaction,
): Promise<{ changed: boolean }> => {
  const rows = (await models.Issue_Arc.findAll({
    where: { fk_issue: issueId },
    attributes: ['fk_arc'],
    transaction,
    raw: true,
  })) as unknown as Array<{ fk_arc: number }>;

  const current = new Set(rows.map((row) => row.fk_arc));

  const desiredArcIds = new Set<number>();
  for (const arcEntry of crawledArcs || []) {
    const title = normalizeString(arcEntry?.title);
    const type = normalizeString(arcEntry?.type);
    if (!title || !type) continue;
    const [arc] = await models.Arc.findOrCreate({
      where: { title, type },
      defaults: { title, type },
      transaction,
    });
    desiredArcIds.add(arc.id);
  }

  let changed = false;

  for (const currentId of current) {
    if (desiredArcIds.has(currentId)) continue;
    changed = true;
    await models.Issue_Arc.destroy({
      where: { fk_issue: issueId, fk_arc: currentId },
      transaction,
    });
  }

  for (const desiredId of desiredArcIds) {
    if (current.has(desiredId)) continue;
    changed = true;
    await models.Issue_Arc.findOrCreate({
      where: { fk_issue: issueId, fk_arc: desiredId },
      defaults: { fk_issue: issueId, fk_arc: desiredId },
      transaction,
    });
  }

  return { changed };
};

const ensureMainCover = async (
  issueId: number,
  coverUrl: string,
  coverNumber: number,
  transaction: Transaction,
): Promise<{ cover: MainCoverRow; changed: boolean }> => {
  const [cover, created] = await models.Cover.findOrCreate({
    where: {
      fk_issue: issueId,
      fk_parent: null,
      number: coverNumber,
    },
    defaults: {
      fk_issue: issueId,
      fk_parent: null,
      number: coverNumber,
      url: coverUrl,
      addinfo: '',
    },
    transaction,
  });

  let changed = created;
  if (normalizeString(cover.url) !== normalizeString(coverUrl)) {
    cover.url = coverUrl;
    await cover.save({ transaction });
    changed = true;
  }

  return { cover: cover as unknown as MainCoverRow, changed };
};

const syncCoverIndividuals = async (
  coverId: number,
  crawledIndividuals: Array<{ name?: string; type?: string | string[] }>,
  transaction: Transaction,
): Promise<{ changed: boolean }> => {
  const rows = (await models.Cover_Individual.findAll({
    where: { fk_cover: coverId },
    attributes: ['fk_individual', 'type'],
    transaction,
    raw: true,
  })) as unknown as Array<{ fk_individual: number; type: string }>;

  const current = new Set(rows.map((row) => `${row.fk_individual}::${normalizeString(row.type)}`));

  const desiredNames = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    desiredNames.add(name);
  }

  const desiredIndividuals = new Map<string, number>();
  for (const name of desiredNames) {
    const [individual] = await models.Individual.findOrCreate({
      where: { name },
      defaults: { name },
      transaction,
    });
    desiredIndividuals.set(name, individual.id);
  }

  const next = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    const individualId = desiredIndividuals.get(name);
    if (!individualId) continue;
    for (const type of normalizeTypeList(entry?.type)) {
      next.add(`${individualId}::${type}`);
    }
  }

  const diff = listDiff(current, next);

  for (const key of diff.remove) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Cover_Individual.destroy({
      where: {
        fk_cover: coverId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  for (const key of diff.add) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Cover_Individual.findOrCreate({
      where: {
        fk_cover: coverId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      defaults: {
        fk_cover: coverId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  return { changed: diff.add.length > 0 || diff.remove.length > 0 };
};

const syncStoryIndividuals = async (
  storyId: number,
  crawledIndividuals: Array<{ name?: string; type?: string | string[] }>,
  transaction: Transaction,
): Promise<{ changed: boolean }> => {
  const rows = (await models.Story_Individual.findAll({
    where: { fk_story: storyId },
    attributes: ['fk_individual', 'type'],
    transaction,
    raw: true,
  })) as unknown as Array<{ fk_individual: number; type: string }>;

  const current = new Set(rows.map((row) => `${row.fk_individual}::${normalizeString(row.type)}`));

  const desiredNames = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    desiredNames.add(name);
  }

  const desiredIndividuals = new Map<string, number>();
  for (const name of desiredNames) {
    const [individual] = await models.Individual.findOrCreate({
      where: { name },
      defaults: { name },
      transaction,
    });
    desiredIndividuals.set(name, individual.id);
  }

  const next = new Set<string>();
  for (const entry of crawledIndividuals || []) {
    const name = normalizeString(entry?.name);
    if (!name) continue;
    const individualId = desiredIndividuals.get(name);
    if (!individualId) continue;
    for (const type of normalizeTypeList(entry?.type)) {
      next.add(`${individualId}::${type}`);
    }
  }

  const diff = listDiff(current, next);

  for (const key of diff.remove) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Story_Individual.destroy({
      where: {
        fk_story: storyId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  for (const key of diff.add) {
    const [rawIndividualId, rawType] = key.split('::');
    await models.Story_Individual.findOrCreate({
      where: {
        fk_story: storyId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      defaults: {
        fk_story: storyId,
        fk_individual: toInt(rawIndividualId),
        type: rawType,
      },
      transaction,
    });
  }

  return { changed: diff.add.length > 0 || diff.remove.length > 0 };
};

const syncStoryAppearances = async (
  storyId: number,
  crawledAppearances: CrawledAppearance[],
  transaction: Transaction,
): Promise<{ changed: boolean }> => {
  const rows = (await models.Story_Appearance.findAll({
    where: { fk_story: storyId },
    attributes: ['fk_appearance', 'role'],
    transaction,
    raw: true,
  })) as unknown as Array<{ fk_appearance: number; role: string }>;

  const current = new Set(rows.map((row) => `${row.fk_appearance}::${normalizeString(row.role)}`));

  const desiredAppearanceIds = new Map<string, number>();
  for (const entry of crawledAppearances || []) {
    const name = normalizeString(entry?.name);
    const type = normalizeString(entry?.type);
    if (!name || !type) continue;
    const key = `${name}::${type}`;
    if (desiredAppearanceIds.has(key)) continue;
    const [appearance] = await models.Appearance.findOrCreate({
      where: { name, type },
      defaults: { name, type },
      transaction,
    });
    desiredAppearanceIds.set(key, appearance.id);
  }

  const next = new Set<string>();
  for (const entry of crawledAppearances || []) {
    const name = normalizeString(entry?.name);
    const type = normalizeString(entry?.type);
    if (!name || !type) continue;
    const key = `${name}::${type}`;
    const appearanceId = desiredAppearanceIds.get(key);
    if (!appearanceId) continue;
    const role = normalizeString(entry?.role);
    next.add(`${appearanceId}::${role}`);
  }

  const diff = listDiff(current, next);

  for (const key of diff.remove) {
    const [rawAppearanceId, rawRole] = key.split('::');
    await models.Story_Appearance.destroy({
      where: {
        fk_story: storyId,
        fk_appearance: toInt(rawAppearanceId),
        role: rawRole,
      },
      transaction,
    });
  }

  for (const key of diff.add) {
    const [rawAppearanceId, rawRole] = key.split('::');
    await models.Story_Appearance.findOrCreate({
      where: {
        fk_story: storyId,
        fk_appearance: toInt(rawAppearanceId),
        role: rawRole,
      },
      defaults: {
        fk_story: storyId,
        fk_appearance: toInt(rawAppearanceId),
        role: rawRole,
      },
      transaction,
    });
  }

  return { changed: diff.add.length > 0 || diff.remove.length > 0 };
};

const reimportIssue = async (
  issue: IssueWithSeries,
  crawler: MarvelCrawlerService,
  transaction: Transaction,
  prefetched?: PrefetchedIssueCrawl,
): Promise<ReimportIssueReport> => {
  const sourceIssueId = toInt(issue.id);
  if (!sourceIssueId) {
    throw new Error('Invalid local issue id for reimport.');
  }

  const report: ReimportIssueReport = {
    issueId: sourceIssueId,
    status: 'skipped',
    label: buildIssueLabel(issue),
    notes: [],
    warnings: [],
    conflicts: [],
    changes: [],
    changeBuckets: createEmptyChangeBuckets(),
  };

  const localSeriesTitle = normalizeString(issue.series?.title);
  const localSeriesVolume = toInt(issue.series?.volume);
  const localNumber = normalizeString(issue.number);

  let crawledSeries: CrawledSeries | null = prefetched?.crawledSeries || null;
  let crawledIssue: CrawledIssueWithSeries | null = prefetched?.crawledIssue || null;
  let seriesCrawlError: Error | null = prefetched?.seriesCrawlError || null;
  let issueCrawlError: Error | null = prefetched?.issueCrawlError || null;
  if (!prefetched) {
    try {
      crawledSeries = await crawler.crawlSeries(localSeriesTitle, localSeriesVolume);
    } catch (error) {
      seriesCrawlError = error as Error;
    }
    try {
      crawledIssue = (await crawler.crawlIssue(
        localSeriesTitle,
        localSeriesVolume,
        localNumber,
      )) as CrawledIssueWithSeries;
    } catch (error) {
      issueCrawlError = error as Error;
    }
  }

  if (!crawledIssue && !crawledSeries) {
    report.status = 'failed';
    report.warnings.push(seriesCrawlError?.message || 'Series crawl failed');
    report.warnings.push(issueCrawlError?.message || 'Issue crawl failed');
    return report;
  }

  if (seriesCrawlError && crawledIssue) {
    report.notes.push('Series crawl failed, issue crawl succeeded (possible hidden series move).');
  }
  if (issueCrawlError && crawledSeries) {
    report.notes.push('Issue crawl failed, series crawl succeeded (possible hidden issue move).');
  }

  const targetSeriesData = resolveTargetSeriesData(issue, crawledSeries, crawledIssue);
  const publisherName = normalizeString(targetSeriesData.publisherName) || 'Marvel Comics';
  const publisher = await models.Publisher.findOne({
    where: { name: publisherName },
    transaction,
  });
  if (!publisher) {
    report.status = 'manual';
    report.conflicts.push(`Target publisher "${publisherName}" does not exist.`);
    return report;
  }

  const targetSeries = await models.Series.findOne({
    where: {
      title: targetSeriesData.title,
      volume: targetSeriesData.volume,
      fk_publisher: publisher.id,
    },
    transaction,
  });
  if (!targetSeries) {
    report.status = 'manual';
    report.conflicts.push(
      `Target series "${targetSeriesData.title}" (Vol. ${targetSeriesData.volume}) does not exist.`,
    );
    return report;
  }

  const targetSeriesId = toInt(targetSeries.id);
  if (!targetSeriesId) {
    throw new Error('Invalid target series id while reimporting issue.');
  }
  const conflictingMainIssue = await models.Issue.findOne({
    where: {
      fk_series: targetSeriesId,
      number: localNumber,
      variant: '',
      id: { [Op.ne]: sourceIssueId },
    },
    transaction,
  });

  if (conflictingMainIssue) {
    report.status = 'manual';
    report.conflicts.push(
      `Target issue already exists in destination series (Issue#${conflictingMainIssue.id}).`,
    );
    return report;
  }
  const mutableIssue = await models.Issue.findByPk(sourceIssueId, { transaction });
  if (!mutableIssue) {
    report.status = 'failed';
    report.warnings.push('Local issue no longer exists during reimport.');
    return report;
  }

  const mutableIssueId = toInt(mutableIssue.id);
  if (!mutableIssueId) {
    throw new Error('Invalid mutable issue id while reimporting.');
  }
  const oldSeriesId = toInt(mutableIssue.fk_series);

  if (toInt(mutableIssue.fk_series) !== targetSeriesId) {
    mutableIssue.fk_series = targetSeriesId;
    report.changes.push(
      `Moved issue to series "${targetSeries.title}" (Vol. ${targetSeries.volume}) / publisher "${publisher.name}".`,
    );
  }

  const mutableIssuePatch: Record<string, unknown> = {};

  if (toInt(mutableIssue.fk_series) !== targetSeriesId) {
    mutableIssuePatch.fk_series = targetSeriesId;
  }

  if (crawledIssue) {
    const nextReleaseDate = dateOnly(crawledIssue.releasedate || mutableIssue.releasedate);
    if (nextReleaseDate && dateOnly(mutableIssue.releasedate) !== nextReleaseDate) {
      mutableIssue.releasedate = nextReleaseDate;
      mutableIssuePatch.releasedate = nextReleaseDate;
      report.changes.push(`Updated release date -> ${nextReleaseDate}.`);
    }

    const nextPrice = normalizePrice(crawledIssue.price);
    if (normalizePrice(mutableIssue.price) !== nextPrice) {
      mutableIssue.price = nextPrice;
      mutableIssuePatch.price = nextPrice;
      report.changes.push(`Updated price -> ${nextPrice}.`);
    }

    const nextCurrency = normalizeString(crawledIssue.currency || mutableIssue.currency);
    if (nextCurrency && normalizeString(mutableIssue.currency) !== nextCurrency) {
      mutableIssue.currency = nextCurrency;
      mutableIssuePatch.currency = nextCurrency;
      report.changes.push(`Updated currency -> ${nextCurrency}.`);
    }
  }

  // Some legacy rows may contain empty comicguide IDs; normalize to zero to avoid numeric DB cast errors.
  if (!normalizeString(mutableIssue.comicguideid)) {
    mutableIssue.comicguideid = '0';
    mutableIssuePatch.comicguideid = '0';
    report.changes.push('Normalized empty comicguideid -> 0.');
  }
  if (Object.keys(mutableIssuePatch).length > 0) {
    await models.Issue.update(mutableIssuePatch, {
      where: { id: mutableIssueId },
      transaction,
    });
  }

  if (crawledIssue) {
    const issueIndividuals = await syncIssueIndividuals(
      mutableIssueId,
      (crawledIssue.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
      transaction,
    );
    if (issueIndividuals.changed) report.changes.push('Synchronized issue individuals.');
    const issueArcs = await syncIssueArcs(mutableIssueId, crawledIssue.arcs || [], transaction);
    if (issueArcs.changed) report.changes.push('Synchronized issue arcs.');
    const mainCoverUrl =
      normalizeString(crawledIssue.cover?.url) || normalizeString(crawledIssue.coverUrl);
    const mainCoverNumber = toInt(crawledIssue.cover?.number);
    const mainCover = await ensureMainCover(
      mutableIssueId,
      mainCoverUrl,
      mainCoverNumber,
      transaction,
    );
    if (mainCover.changed) report.changes.push('Synchronized main cover metadata.');

    const mainCoverId = toPositiveInt(mainCover.cover.id);
    if (!mainCoverId) {
      throw new Error('Invalid main cover id while reimporting issue.');
    }
    const coverIndividuals = await syncCoverIndividuals(
      mainCoverId,
      (crawledIssue.cover?.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
      transaction,
    );
    if (coverIndividuals.changed) report.changes.push('Synchronized main cover individuals.');
    const localStories = (await models.Story.findAll({
      where: { fk_issue: mutableIssueId },
      order: [
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
    })) as unknown as StoryRow[];

    const crawledStories = crawledIssue.stories || [];
    if (localStories.length !== crawledStories.length) {
      report.storyCount = { local: localStories.length, crawled: crawledStories.length };
      report.status = 'manual';
      report.conflicts.push(
        `Story count mismatch (local=${localStories.length}, crawled=${crawledStories.length}).`,
      );
    } else {
      for (let index = 0; index < localStories.length; index += 1) {
        const localStory = localStories[index];
        const crawledStory = crawledStories[index];
        const localStoryId = toPositiveInt(localStory.id);
        if (!localStoryId) {
          report.status = 'manual';
          report.conflicts.push('Encountered story with invalid local id; manual fix required.');
          continue;
        }
        const normalizedNumber = toInt(crawledStory.number || index + 1) || index + 1;
        if (localStory.number !== normalizedNumber) {
          await models.Story.update(
            { number: normalizedNumber },
            {
              where: { id: localStoryId },
              transaction,
            },
          );
          report.changes.push(
            `Normalized story order for Story#${localStoryId} -> ${normalizedNumber}.`,
          );
        }
        const storyIndividuals = await syncStoryIndividuals(
          localStoryId,
          (crawledStory.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
          transaction,
        );
        if (storyIndividuals.changed) {
          report.changes.push(`Synchronized story individuals for Story#${localStoryId}.`);
        }
        const storyAppearances = await syncStoryAppearances(
          localStoryId,
          crawledStory.appearances || [],
          transaction,
        );
        if (storyAppearances.changed) {
          report.changes.push(`Synchronized story appearances for Story#${localStoryId}.`);
        }
      }
    }

    report.notes.push('Reprint/ReprintOf links are intentionally not changed by this task.');
    const crawledVariants = (crawledIssue.variants || []) as CrawledVariantLike[];
    const desiredVariantNames = new Set<string>();

    for (const rawVariant of crawledVariants) {
      const variantName = normalizeString(rawVariant.variant);
      if (!variantName) continue;
      desiredVariantNames.add(variantName);

      const variantNumber =
        normalizeString(rawVariant.number || mutableIssue.number) || mutableIssue.number;
      const targetVariantConflict = await models.Issue.findOne({
        where: {
          fk_series: targetSeriesId,
          number: variantNumber,
          variant: variantName,
          id: { [Op.ne]: mutableIssueId },
        },
        transaction,
      });

      let variantIssue = targetVariantConflict;
      if (!variantIssue) {
        if (oldSeriesId) {
          variantIssue = await models.Issue.findOne({
            where: {
              fk_series: oldSeriesId,
              number: variantNumber,
              variant: variantName,
              id: { [Op.ne]: mutableIssueId },
            },
            transaction,
          });
        }
      }

      if (
        targetVariantConflict &&
        variantIssue &&
        toInt(variantIssue.fk_series) === targetSeriesId
      ) {
        report.status = 'manual';
        report.conflicts.push(
          `Variant conflict for "${variantName}": target variant Issue#${variantIssue.id} already exists.`,
        );
        continue;
      }

      if (!variantIssue) {
        variantIssue = await models.Issue.create(
          {
            title: '',
            number: variantNumber,
            format: normalizeString(rawVariant.format) || mutableIssue.format,
            variant: variantName,
            releasedate: dateOnly(rawVariant.releasedate || mutableIssue.releasedate),
            pages: 0,
            price: normalizePrice(rawVariant.price),
            currency: normalizeString(rawVariant.currency) || mutableIssue.currency,
            comicguideid: '0',
            isbn: '',
            limitation: normalizeLimitationForDb(undefined),
            addinfo: '',
            fk_series: targetSeriesId,
          },
          { transaction },
        );
        report.changes.push(`Created variant issue "${variantName}".`);
      } else {
        let variantChanged = false;
        const variantPatch: Record<string, unknown> = {};
        if (toInt(variantIssue.fk_series) !== targetSeriesId) {
          variantIssue.fk_series = targetSeriesId;
          variantPatch.fk_series = targetSeriesId;
          variantChanged = true;
        }

        const nextFormat =
          normalizeString(rawVariant.format) || normalizeString(variantIssue.format);
        if (nextFormat && normalizeString(variantIssue.format) !== nextFormat) {
          variantIssue.format = nextFormat;
          variantPatch.format = nextFormat;
          variantChanged = true;
        }

        const nextVariantRelease = dateOnly(rawVariant.releasedate || variantIssue.releasedate);
        if (nextVariantRelease && dateOnly(variantIssue.releasedate) !== nextVariantRelease) {
          variantIssue.releasedate = nextVariantRelease;
          variantPatch.releasedate = nextVariantRelease;
          variantChanged = true;
        }

        const nextVariantPrice = normalizePrice(rawVariant.price);
        if (normalizePrice(variantIssue.price) !== nextVariantPrice) {
          variantIssue.price = nextVariantPrice;
          variantPatch.price = nextVariantPrice;
          variantChanged = true;
        }

        const nextVariantCurrency =
          normalizeString(rawVariant.currency) || normalizeString(variantIssue.currency);
        if (nextVariantCurrency && normalizeString(variantIssue.currency) !== nextVariantCurrency) {
          variantIssue.currency = nextVariantCurrency;
          variantPatch.currency = nextVariantCurrency;
          variantChanged = true;
        }

        if (!normalizeString(variantIssue.comicguideid)) {
          variantIssue.comicguideid = '0';
          variantPatch.comicguideid = '0';
          variantChanged = true;
        }

        if (variantChanged) {
          await models.Issue.update(variantPatch, {
            where: { id: variantIssue.id },
            transaction,
          });
          report.changes.push(`Updated variant issue "${variantName}".`);
        }
      }
      const variantCover = rawVariant.cover;
      if (!variantCover) continue;

      const variantIssueId = toPositiveInt(variantIssue.id);
      if (!variantIssueId) {
        throw new Error(`Invalid variant issue id for "${variantName}".`);
      }

      const ensuredVariantCover = await ensureMainCover(
        variantIssueId,
        normalizeString(variantCover.url),
        toInt(variantCover.number),
        transaction,
      );
      if (ensuredVariantCover.changed) {
        report.changes.push(`Synchronized cover metadata for variant "${variantName}".`);
      }

      const ensuredVariantCoverId = toPositiveInt(ensuredVariantCover.cover.id);
      if (!ensuredVariantCoverId) {
        throw new Error(`Invalid cover id for variant "${variantName}".`);
      }
      const variantCoverIndividuals = await syncCoverIndividuals(
        ensuredVariantCoverId,
        (variantCover.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
        transaction,
      );
      if (variantCoverIndividuals.changed) {
        report.changes.push(`Synchronized cover individuals for variant "${variantName}".`);
      }
    }
    const existingTargetVariants = (await models.Issue.findAll({
      where: {
        fk_series: targetSeriesId,
        number: mutableIssue.number,
        variant: { [Op.ne]: '' },
      },
      transaction,
    })) as IssueWithSeries[];

    for (const existingVariant of existingTargetVariants) {
      const variantName = normalizeString(existingVariant.variant);
      if (desiredVariantNames.has(variantName)) continue;

      const existingVariantId = toPositiveInt(existingVariant.id);
      if (!existingVariantId) {
        report.status = 'manual';
        report.conflicts.push(
          `Variant "${variantName}" has invalid local id; manual fix required.`,
        );
        continue;
      }

      const storyCount = await models.Story.count({
        where: { fk_issue: existingVariantId },
        transaction,
      });

      if (storyCount > 0) {
        report.status = 'manual';
        report.conflicts.push(
          `Variant "${variantName}" exists locally but not in crawl and has ${storyCount} stories.`,
        );
        continue;
      }

      await models.Issue.destroy({ where: { id: existingVariantId }, transaction });
      report.changes.push(`Removed obsolete variant "${variantName}".`);
    }
  }

  if (report.status !== 'manual') {
    if (report.changes.length > 0) report.status = 'updated';
    else report.status = 'skipped';
  }
  report.changeBuckets = bucketizeChanges(report.changes);

  return report;
};

const loadIssuesForScope = async (
  scope: ReimportScope,
  transaction?: Transaction,
): Promise<IssueWithSeries[]> => {
  const include = [
    {
      model: models.Series,
      as: 'series',
      required: true,
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
    },
  ];

  if (scope.kind === 'issue') {
    const issue = await models.Issue.findByPk(scope.issueId, {
      include,
      transaction,
    });

    if (!issue) return [];

    const siblings = (await models.Issue.findAll({
      where: {
        fk_series: issue.fk_series,
        number: issue.number,
      },
      include,
      transaction,
      order: [['id', 'ASC']],
    })) as unknown as IssueWithSeries[];

    if (siblings.length === 0) return [issue as unknown as IssueWithSeries];
    return siblings;
  }

  const where: Record<string, unknown> = {
    variant: '',
  };

  if (scope.kind === 'series') {
    where.fk_series = scope.seriesId;
  }

  const issues = (await models.Issue.findAll({
    where,
    include,
    transaction,
    order: [['id', 'ASC']],
  })) as unknown as IssueWithSeries[];

  if (scope.kind === 'publisher') {
    return issues.filter((issue) => toInt(issue.series?.publisher?.id) === scope.publisherId);
  }

  if (scope.kind === 'all-us') {
    return issues.filter((issue) => Boolean(issue.series?.publisher?.original));
  }

  return issues;
};

const loadIssuesBatchForScope = async (
  scope: ReimportScope,
  offset: number,
  limit: number,
  transaction?: Transaction,
): Promise<IssueWithSeries[]> => {
  const include = [
    {
      model: models.Series,
      as: 'series',
      required: true,
      include: [
        {
          model: models.Publisher,
          as: 'publisher',
          required: true,
          ...(scope.kind === 'publisher' ? { where: { id: scope.publisherId } } : {}),
          ...(scope.kind === 'all-us' ? { where: { original: true } } : {}),
        },
      ],
    },
  ];

  if (scope.kind === 'issue') {
    if (offset > 0) return [];
    const issue = await models.Issue.findByPk(scope.issueId, {
      include,
      transaction,
    });
    if (!issue) return [];

    const siblings = (await models.Issue.findAll({
      where: {
        fk_series: issue.fk_series,
        number: issue.number,
      },
      include,
      transaction,
      order: [['id', 'ASC']],
    })) as unknown as IssueWithSeries[];

    if (siblings.length === 0) return [issue as unknown as IssueWithSeries];
    return siblings;
  }

  const where: Record<string, unknown> = {
    variant: '',
  };

  if (scope.kind === 'series') {
    where.fk_series = scope.seriesId;
  }

  const issues = (await models.Issue.findAll({
    where,
    include,
    transaction,
    order: [['id', 'ASC']],
    offset,
    limit,
  })) as unknown as IssueWithSeries[];

  return issues;
};

const dedupeBySeriesNumber = (issues: IssueWithSeries[]): IssueWithSeries[] => {
  const byKey = new Map<string, IssueWithSeries>();

  for (const issue of issues) {
    const key = `${toInt(issue.fk_series)}::${normalizeLower(issue.number)}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, issue);
      continue;
    }

    const existingVariant = normalizeString(existing.variant);
    const currentVariant = normalizeString(issue.variant);
    if (existingVariant && !currentVariant) {
      byKey.set(key, issue);
      continue;
    }

    if (toInt(issue.id) < toInt(existing.id)) {
      byKey.set(key, issue);
    }
  }

  return Array.from(byKey.values());
};

const collectSeriesCandidates = (issues: IssueWithSeries[]): SeriesCandidate[] => {
  const byKey = new Map<string, SeriesCandidate>();

  for (const issue of issues) {
    const title = normalizeString(issue.series?.title);
    const volume = toInt(issue.series?.volume);
    if (!title || !volume) continue;

    const key = `${normalizeLower(title)}::${volume}`;
    if (byKey.has(key)) continue;

    byKey.set(key, {
      key,
      title,
      volume,
      publisherName: normalizeString(issue.series?.publisher?.name) || 'Marvel Comics',
      startyear: toInt(issue.series?.startyear),
      endyear: toInt(issue.series?.endyear),
    });
  }

  return Array.from(byKey.values());
};

const prefetchIssueCrawls = async (
  issues: IssueWithSeries[],
  crawler: MarvelCrawlerService,
): Promise<Map<number, PrefetchedIssueCrawl>> => {
  const prefetched = new Map<number, PrefetchedIssueCrawl>();

  for (const issue of issues) {
    const issueId = toInt(issue.id);
    if (!issueId) continue;

    const localSeriesTitle = normalizeString(issue.series?.title);
    const localSeriesVolume = toInt(issue.series?.volume);
    const localNumber = normalizeString(issue.number);

    let crawledSeries: CrawledSeries | null = null;
    let crawledIssue: CrawledIssueWithSeries | null = null;
    let seriesCrawlError: Error | null = null;
    let issueCrawlError: Error | null = null;

    try {
      crawledSeries = await crawler.crawlSeries(localSeriesTitle, localSeriesVolume);
    } catch (error) {
      seriesCrawlError = error as Error;
    }

    try {
      crawledIssue = (await crawler.crawlIssue(
        localSeriesTitle,
        localSeriesVolume,
        localNumber,
      )) as CrawledIssueWithSeries;
    } catch (error) {
      issueCrawlError = error as Error;
    }

    prefetched.set(issueId, {
      crawledSeries,
      crawledIssue,
      seriesCrawlError,
      issueCrawlError,
    });
  }

  return prefetched;
};

const collectSeriesCandidatesFromPrefetch = (
  issues: IssueWithSeries[],
  prefetched: Map<number, PrefetchedIssueCrawl>,
): SeriesCandidate[] => {
  const byKey = new Map<string, SeriesCandidate>();

  for (const issue of issues) {
    const issueId = toInt(issue.id);
    const crawl = prefetched.get(issueId);

    const targetSeriesData = resolveTargetSeriesData(
      issue,
      crawl?.crawledSeries || null,
      crawl?.crawledIssue || null,
    );

    const title = normalizeString(targetSeriesData.title);
    const volume = toInt(targetSeriesData.volume);
    const publisherName = normalizeString(targetSeriesData.publisherName) || 'Marvel Comics';
    if (!title || !volume) continue;

    const key = `${normalizeLower(title)}::${volume}::${normalizeLower(publisherName)}`;
    if (byKey.has(key)) continue;

    byKey.set(key, {
      key,
      title,
      volume,
      publisherName,
      startyear: toInt(targetSeriesData.startyear),
      endyear: toInt(targetSeriesData.endyear),
    });
  }

  return Array.from(byKey.values());
};

const collectPublisherCandidates = (seriesCandidates: SeriesCandidate[]): PublisherCandidate[] => {
  const byKey = new Map<string, PublisherCandidate>();

  for (const candidate of seriesCandidates) {
    const name = normalizeString(candidate.publisherName) || 'Marvel Comics';
    const key = normalizeLower(name);
    if (byKey.has(key)) continue;
    byKey.set(key, { key, name });
  }

  return Array.from(byKey.values());
};

const loadPublisherCandidatesBatchForScope = async (
  scope: ReimportScope,
  offset: number,
  limit: number,
  transaction?: Transaction,
): Promise<PublisherCandidate[]> => {
  if (scope.kind === 'publisher') {
    if (offset > 0) return [];
    const publisher = await models.Publisher.findByPk(scope.publisherId, { transaction });
    if (!publisher) return [];
    return [{ key: normalizeLower(publisher.name), name: normalizeString(publisher.name) }];
  }

  if (scope.kind === 'series') {
    if (offset > 0) return [];
    const series = (await models.Series.findByPk(scope.seriesId, {
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
      transaction,
    })) as unknown as SeriesWithPublisher | null;
    const publisher = series?.publisher as SeriesWithPublisher['publisher'] | undefined;
    if (!publisher) return [];
    return [{ key: normalizeLower(publisher.name), name: normalizeString(publisher.name) }];
  }

  if (scope.kind === 'issue') {
    if (offset > 0) return [];
    const issue = await models.Issue.findByPk(scope.issueId, {
      include: [
        {
          model: models.Series,
          as: 'series',
          required: true,
          include: [{ model: models.Publisher, as: 'publisher', required: true }],
        },
      ],
      transaction,
    });
    const publisher = (issue as unknown as IssueWithSeries | null)?.series?.publisher;
    if (!publisher) return [];
    return [{ key: normalizeLower(publisher.name), name: normalizeString(publisher.name) }];
  }

  const rows = (await models.Publisher.findAll({
    where: { original: true },
    attributes: ['name'],
    order: [['id', 'ASC']],
    offset,
    limit,
    transaction,
  })) as unknown as Array<{ name: string }>;

  return rows
    .map((row) => normalizeString(row.name))
    .filter((name) => Boolean(name))
    .map((name) => ({ key: normalizeLower(name), name }));
};

const loadSeriesCandidatesBatchForScope = async (
  scope: ReimportScope,
  offset: number,
  limit: number,
  transaction?: Transaction,
): Promise<SeriesCandidate[]> => {
  if (scope.kind === 'series') {
    if (offset > 0) return [];
    const rows = (await models.Series.findAll({
      where: { id: scope.seriesId },
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
      transaction,
    })) as unknown as SeriesWithPublisher[];
    return rows.map((series) => ({
      key: `${normalizeLower(series.title)}::${toInt(series.volume)}::${normalizeLower(series.publisher?.name)}`,
      title: normalizeString(series.title),
      volume: toInt(series.volume),
      publisherName: normalizeString(series.publisher?.name) || 'Marvel Comics',
      startyear: toInt(series.startyear),
      endyear: toInt(series.endyear),
    }));
  }

  if (scope.kind === 'issue') {
    if (offset > 0) return [];
    const issue = await models.Issue.findByPk(scope.issueId, {
      include: [
        {
          model: models.Series,
          as: 'series',
          required: true,
          include: [{ model: models.Publisher, as: 'publisher', required: true }],
        },
      ],
      transaction,
    });
    const series = (issue as unknown as IssueWithSeries | null)?.series;
    if (!series) return [];
    return [
      {
        key: `${normalizeLower(series.title)}::${toInt(series.volume)}::${normalizeLower(series.publisher?.name)}`,
        title: normalizeString(series.title),
        volume: toInt(series.volume),
        publisherName: normalizeString(series.publisher?.name) || 'Marvel Comics',
        startyear: toInt(series.startyear),
        endyear: toInt(series.endyear),
      },
    ];
  }

  const where: Record<string, unknown> = {};
  if (scope.kind === 'publisher') {
    where.fk_publisher = scope.publisherId;
  }

  const include = [
    {
      model: models.Publisher,
      as: 'publisher',
      required: true,
      ...(scope.kind === 'all-us' ? { where: { original: true } } : {}),
    },
  ];

  const rows = (await models.Series.findAll({
    where,
    include,
    order: [['id', 'ASC']],
    offset,
    limit,
    transaction,
  })) as unknown as SeriesWithPublisher[];

  return rows.map((series) => ({
    key: `${normalizeLower(series.title)}::${toInt(series.volume)}::${normalizeLower(series.publisher?.name)}`,
    title: normalizeString(series.title),
    volume: toInt(series.volume),
    publisherName: normalizeString(series.publisher?.name) || 'Marvel Comics',
    startyear: toInt(series.startyear),
    endyear: toInt(series.endyear),
  }));
};

const loadAllPublisherCandidatesForScope = async (
  scope: ReimportScope,
): Promise<PublisherCandidate[]> => {
  const byKey = new Map<string, PublisherCandidate>();
  let offset = 0;
  while (true) {
    const batch = await loadPublisherCandidatesBatchForScope(scope, offset, ENTITY_BATCH_SIZE);
    if (batch.length === 0) break;
    for (const candidate of batch) {
      if (!candidate.name) continue;
      if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
    }
    if (batch.length < ENTITY_BATCH_SIZE) break;
    offset += batch.length;
  }
  return Array.from(byKey.values());
};

const loadAllSeriesCandidatesForScope = async (
  scope: ReimportScope,
): Promise<SeriesCandidate[]> => {
  const byKey = new Map<string, SeriesCandidate>();
  let offset = 0;
  while (true) {
    const batch = await loadSeriesCandidatesBatchForScope(scope, offset, ENTITY_BATCH_SIZE);
    if (batch.length === 0) break;
    for (const candidate of batch) {
      if (!candidate.title || !candidate.volume) continue;
      if (!byKey.has(candidate.key)) byKey.set(candidate.key, candidate);
    }
    if (batch.length < ENTITY_BATCH_SIZE) break;
    offset += batch.length;
  }
  return Array.from(byKey.values());
};

const runPublisherPhase = async (
  candidates: PublisherCandidate[],
  dryRun: boolean,
): Promise<string[]> => {
  logger.info(`[reimport] phase publishers (${candidates.length} publishers)`);
  const changes: string[] = [];
  const batches = chunkBySize(candidates, ENTITY_BATCH_SIZE);
  let processed = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    logger.info(`[reimport] publisher batch ${batchIndex + 1}/${batches.length} (${batch.length})`);

    for (const candidate of batch) {
      const transaction = await models.sequelize.transaction();
      try {
        const publisherName = normalizeString(candidate.name) || 'Marvel Comics';
        const { created, updatedOriginal } = await findOrCreatePublisher(
          publisherName,
          transaction,
        );
        if (created) {
          changes.push(`Created publisher "${publisherName}".`);
        } else if (updatedOriginal) {
          changes.push(`Updated publisher "${publisherName}" to original=true.`);
        }

        if (dryRun) await transaction.rollback();
        else await transaction.commit();

        processed += 1;
        console.log(`[reimport][publisher] ${processed}/${candidates.length} ${publisherName} ok`);
      } catch (error) {
        await transaction.rollback();
        const message = error instanceof Error ? error.message : String(error);
        changes.push(`Publisher phase failed for "${candidate.name}": ${message}`);
        logger.warn(`[reimport] publisher phase failed for "${candidate.name}": ${message}`);
        processed += 1;
        console.log(
          `[reimport][publisher] ${processed}/${candidates.length} ${candidate.name || 'unknown'} failed: ${message}`,
        );
      }
    }
  }

  return changes;
};

const runSeriesPhase = async (
  candidates: SeriesCandidate[],
  dryRun: boolean,
): Promise<string[]> => {
  logger.info(`[reimport] phase series (${candidates.length} series candidates)`);
  const changes: string[] = [];
  const batches = chunkBySize(candidates, ENTITY_BATCH_SIZE);
  let processed = 0;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    logger.info(`[reimport] series batch ${batchIndex + 1}/${batches.length} (${batch.length})`);

    for (const candidate of batch) {
      const transaction = await models.sequelize.transaction();
      try {
        const title = normalizeString(candidate.title) || candidate.title;
        const volume = toInt(candidate.volume) || candidate.volume;
        const startyear = toInt(candidate.startyear) || candidate.startyear;
        const endyear = toInt(candidate.endyear) || candidate.endyear;
        const publisherName = normalizeString(candidate.publisherName) || 'Marvel Comics';

        const { publisher } = await findOrCreatePublisher(publisherName, transaction);
        const publisherId = toInt(publisher.id);
        if (!publisherId) throw new Error('Invalid publisher id in series phase.');

        const [series, created] = await models.Series.findOrCreate({
          where: {
            title,
            volume,
            fk_publisher: publisherId,
          },
          defaults: {
            title,
            volume,
            fk_publisher: publisherId,
            startyear,
            endyear,
            addinfo: '',
          },
          transaction,
        });

        if (!created) {
          let changed = false;
          if (toInt(series.startyear) !== startyear) {
            series.startyear = startyear;
            changed = true;
            changes.push(`Updated series "${title}" (Vol. ${volume}) startyear -> ${startyear}.`);
          }
          if (toInt(series.endyear) !== endyear) {
            series.endyear = endyear;
            changed = true;
            changes.push(`Updated series "${title}" (Vol. ${volume}) endyear -> ${endyear}.`);
          }
          if (changed) await series.save({ transaction });
        } else {
          changes.push(
            `Created series "${title}" (Vol. ${volume}) for publisher "${publisher.name}".`,
          );
        }

        if (dryRun) await transaction.rollback();
        else await transaction.commit();

        processed += 1;
        console.log(
          `[reimport][series] ${processed}/${candidates.length} ${title} (Vol. ${volume}) ok`,
        );
      } catch (error) {
        await transaction.rollback();
        const message = error instanceof Error ? error.message : String(error);
        changes.push(
          `Series phase failed for "${candidate.title}" (Vol. ${candidate.volume}): ${message}`,
        );
        logger.warn(
          `[reimport] series phase failed for "${candidate.title}" (Vol. ${candidate.volume}): ${message}`,
        );
        processed += 1;
        console.log(
          `[reimport][series] ${processed}/${candidates.length} ${candidate.title} (Vol. ${candidate.volume}) failed: ${message}`,
        );
      }
    }
  }

  return changes;
};

export async function runReimport(options?: ReimportRunOptions): Promise<ReimportReport | null> {
  const dryRun = normalizeDryRun(options);
  const scope = options?.scope || defaultScope;
  const startedAt = new Date().toISOString();
  const crawler = new MarvelCrawlerService();

  try {
    logger.info(
      `[reimport] starting run (dryRun=${dryRun}, scope=${scope.kind}, batchSize=${ISSUE_BATCH_SIZE})`,
    );
    const reports: ReimportIssueReport[] = [];
    logger.info('[reimport] phase publishers');
    const publisherCandidates = await loadAllPublisherCandidatesForScope(scope);
    const publisherPhaseChanges = await runPublisherPhase(publisherCandidates, dryRun);

    logger.info('[reimport] phase series');
    const seriesCandidates = await loadAllSeriesCandidatesForScope(scope);
    const seriesPhaseChanges = await runSeriesPhase(seriesCandidates, dryRun);

    logger.info('[reimport] phase issues');
    const maxRootIssues =
      dryRun && scope.kind === 'all-us' ? DRY_RUN_ALL_US_LIMIT : Number.MAX_SAFE_INTEGER;
    const dedupeSeenKeys = new Set<string>();
    let issueReadOffset = 0;
    let processedIssueCount = 0;
    let issueBatchNumber = 0;

    while (processedIssueCount < maxRootIssues) {
      const loadedIssues = await loadIssuesBatchForScope(scope, issueReadOffset, ISSUE_BATCH_SIZE);
      if (loadedIssues.length === 0) break;
      issueReadOffset += loadedIssues.length;
      issueBatchNumber += 1;
      logger.info(
        `[reimport] processing issue batch ${issueBatchNumber} (${loadedIssues.length} rows)`,
      );

      for (const issue of loadedIssues) {
        const issueKey = `${toInt(issue.fk_series)}::${normalizeLower(issue.number)}`;
        if (dedupeSeenKeys.has(issueKey)) continue;
        dedupeSeenKeys.add(issueKey);
        if (processedIssueCount >= maxRootIssues) break;
        processedIssueCount += 1;
        logger.info(`[reimport] ${processedIssueCount} - ${buildIssueLabel(issue)}`);
        const issueTransaction = await models.sequelize.transaction();
        try {
          const issueReport = await reimportIssue(issue, crawler, issueTransaction);
          reports.push(issueReport);

          if (dryRun) await issueTransaction.rollback();
          else await issueTransaction.commit();
          console.log(
            `[reimport][issue] ${processedIssueCount} ${buildIssueLabel(issue)} ${issueReport.status}`,
          );
        } catch (error) {
          await issueTransaction.rollback();
          const message = error instanceof Error ? error.message : String(error);
          logger.error(`[reimport] issue failed (${buildIssueLabel(issue)}): ${message}`);
          console.log(
            `[reimport][issue] ${processedIssueCount} ${buildIssueLabel(issue)} failed: ${message}`,
          );
          reports.push({
            issueId: toInt(issue.id),
            status: 'failed',
            label: buildIssueLabel(issue),
            notes: [],
            warnings: [message],
            conflicts: [],
            changes: [],
            changeBuckets: createEmptyChangeBuckets(),
          });
        }
      }
    }

    const changedPublishers = countMatchingChanges(publisherPhaseChanges, [
      'created publisher',
      'updated publisher',
    ]);
    const changedSeries = countMatchingChanges(seriesPhaseChanges, [
      'created series',
      'updated series',
    ]);
    const failedPublishers = countMatchingChanges(publisherPhaseChanges, [
      'publisher phase failed',
    ]);
    const failedSeries = countMatchingChanges(seriesPhaseChanges, ['series phase failed']);
    const changedIssues = reports.filter((entry) => entry.changes.length > 0).length;
    const normalizedIssues = reports.filter((entry) =>
      entry.changes.some((change) => normalizeLower(change).includes('normalized ')),
    ).length;
    const updatedIssues = reports.filter((entry) => entry.status === 'updated').length;
    const conflictIssues = reports.filter((entry) => entry.status === 'manual').length;
    const failedIssues = reports.filter((entry) => entry.status === 'failed').length;
    const conflictSeries = reports.filter((entry) => {
      return entry.conflicts.some((conflict) => {
        const normalized = normalizeLower(conflict);
        return normalized.includes('destination series') || normalized.includes('target series');
      });
    }).length;

    const finishedAt = new Date().toISOString();
    const result: ReimportReport = {
      dryRun,
      startedAt,
      finishedAt,
      scope,
      result: {
        changedPublishers,
        changedSeries,
        changedIssues,
        normalizedIssues,
        updatedIssues,
        conflictIssues,
        failedIssues,
        conflictSeries,
        failedSeries,
        failedPublishers,
      },
    };

    return result;
  } catch (error) {
    logger.error(`[reimport] failed: ${(error as Error).message}`);
    return null;
  }
}

export async function triggerManualReimportDryRun(
  scope?: ReimportScope,
): Promise<ReimportReport | null> {
  return runReimport({ dryRun: true, scope: scope || defaultScope });
}
