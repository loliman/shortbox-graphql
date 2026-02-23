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
  summary: {
    total: number;
    updated: number;
    skipped: number;
    manual: number;
    failed: number;
  };
  issues: ReimportIssueReport[];
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

  if (!publisher.original) {
    publisher.original = true;
    await publisher.save({ transaction });
  }

  return { publisher, created };
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
  const fallbackPublisherName = normalizeString(localIssue.series?.publisher?.name) || 'Marvel Comics';
  const fallbackStart = toInt(localIssue.series?.startyear);
  const fallbackEnd = toInt(localIssue.series?.endyear);

  return {
    title:
      normalizeString(crawledIssue?.seriesTitle) || normalizeString(crawledSeries?.title) || fallbackTitle,
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
): Promise<ReimportIssueReport> => {
  const report: ReimportIssueReport = {
    issueId: issue.id,
    status: 'skipped',
    label: buildIssueLabel(issue),
    notes: [],
    warnings: [],
    conflicts: [],
    changes: [],
  };

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

  const { publisher } = await findOrCreatePublisher(targetSeriesData.publisherName, transaction);

  const [targetSeries, createdSeries] = await models.Series.findOrCreate({
    where: {
      title: targetSeriesData.title,
      volume: targetSeriesData.volume,
      fk_publisher: publisher.id,
    },
    defaults: {
      title: targetSeriesData.title,
      volume: targetSeriesData.volume,
      fk_publisher: publisher.id,
      startyear: targetSeriesData.startyear,
      endyear: targetSeriesData.endyear,
      addinfo: '',
    },
    transaction,
  });

  if (createdSeries) {
    report.changes.push(
      `Created series "${targetSeriesData.title}" (Vol. ${targetSeriesData.volume}) for publisher "${publisher.name}".`,
    );
  }

  if (targetSeries.startyear !== targetSeriesData.startyear) {
    targetSeries.startyear = targetSeriesData.startyear;
    await targetSeries.save({ transaction });
    report.changes.push(`Updated series startyear -> ${targetSeriesData.startyear}.`);
  }

  if (toInt(targetSeries.endyear) !== targetSeriesData.endyear) {
    targetSeries.endyear = targetSeriesData.endyear;
    await targetSeries.save({ transaction });
    report.changes.push(`Updated series endyear -> ${targetSeriesData.endyear}.`);
  }

  const conflictingMainIssue = await models.Issue.findOne({
    where: {
      fk_series: targetSeries.id,
      number: localNumber,
      variant: '',
      id: { [Op.ne]: issue.id },
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

  const mutableIssue = await models.Issue.findByPk(issue.id, { transaction });
  if (!mutableIssue) {
    report.status = 'failed';
    report.warnings.push('Local issue no longer exists during reimport.');
    return report;
  }

  const oldSeriesId = mutableIssue.fk_series;

  if (mutableIssue.fk_series !== targetSeries.id) {
    mutableIssue.fk_series = targetSeries.id;
    report.changes.push(
      `Moved issue to series "${targetSeries.title}" (Vol. ${targetSeries.volume}) / publisher "${publisher.name}".`,
    );
  }

  if (crawledIssue) {
    const nextReleaseDate = dateOnly(crawledIssue.releasedate || mutableIssue.releasedate);
    if (nextReleaseDate && dateOnly(mutableIssue.releasedate) !== nextReleaseDate) {
      mutableIssue.releasedate = nextReleaseDate;
      report.changes.push(`Updated release date -> ${nextReleaseDate}.`);
    }

    const nextPrice = normalizePrice(crawledIssue.price);
    if (normalizePrice(mutableIssue.price) !== nextPrice) {
      mutableIssue.price = nextPrice;
      report.changes.push(`Updated price -> ${nextPrice}.`);
    }

    const nextCurrency = normalizeString(crawledIssue.currency || mutableIssue.currency);
    if (nextCurrency && normalizeString(mutableIssue.currency) !== nextCurrency) {
      mutableIssue.currency = nextCurrency;
      report.changes.push(`Updated currency -> ${nextCurrency}.`);
    }
  }

  await mutableIssue.save({ transaction });

  if (crawledIssue) {
    const issueIndividuals = await syncIssueIndividuals(
      mutableIssue.id,
      (crawledIssue.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
      transaction,
    );
    if (issueIndividuals.changed) report.changes.push('Synchronized issue individuals.');

    const issueArcs = await syncIssueArcs(mutableIssue.id, crawledIssue.arcs || [], transaction);
    if (issueArcs.changed) report.changes.push('Synchronized issue arcs.');

    const mainCoverUrl = normalizeString(crawledIssue.cover?.url) || normalizeString(crawledIssue.coverUrl);
    const mainCoverNumber = toInt(crawledIssue.cover?.number);
    const mainCover = await ensureMainCover(mutableIssue.id, mainCoverUrl, mainCoverNumber, transaction);
    if (mainCover.changed) report.changes.push('Synchronized main cover metadata.');

    const coverIndividuals = await syncCoverIndividuals(
      mainCover.cover.id,
      (crawledIssue.cover?.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
      transaction,
    );
    if (coverIndividuals.changed) report.changes.push('Synchronized main cover individuals.');

    const localStories = (await models.Story.findAll({
      where: { fk_issue: mutableIssue.id },
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

        const normalizedNumber = toInt(crawledStory.number || index + 1) || index + 1;
        if (localStory.number !== normalizedNumber) {
          await models.Story.update(
            { number: normalizedNumber },
            {
              where: { id: localStory.id },
              transaction,
            },
          );
          report.changes.push(`Normalized story order for Story#${localStory.id} -> ${normalizedNumber}.`);
        }

        const storyIndividuals = await syncStoryIndividuals(
          localStory.id,
          (crawledStory.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
          transaction,
        );
        if (storyIndividuals.changed) {
          report.changes.push(`Synchronized story individuals for Story#${localStory.id}.`);
        }

        const storyAppearances = await syncStoryAppearances(
          localStory.id,
          crawledStory.appearances || [],
          transaction,
        );
        if (storyAppearances.changed) {
          report.changes.push(`Synchronized story appearances for Story#${localStory.id}.`);
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

      const variantNumber = normalizeString(rawVariant.number || mutableIssue.number) || mutableIssue.number;
      const targetVariantConflict = await models.Issue.findOne({
        where: {
          fk_series: targetSeries.id,
          number: variantNumber,
          variant: variantName,
          id: { [Op.ne]: mutableIssue.id },
        },
        transaction,
      });

      let variantIssue = targetVariantConflict;
      if (!variantIssue) {
        variantIssue = await models.Issue.findOne({
          where: {
            fk_series: oldSeriesId,
            number: variantNumber,
            variant: variantName,
            id: { [Op.ne]: mutableIssue.id },
          },
          transaction,
        });
      }

      if (targetVariantConflict && variantIssue && toInt(variantIssue.fk_series) === targetSeries.id) {
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
            limitation: '',
            addinfo: '',
            fk_series: targetSeries.id,
          },
          { transaction },
        );
        report.changes.push(`Created variant issue "${variantName}".`);
      } else {
        let variantChanged = false;
        if (variantIssue.fk_series !== targetSeries.id) {
          variantIssue.fk_series = targetSeries.id;
          variantChanged = true;
        }

        const nextFormat = normalizeString(rawVariant.format) || normalizeString(variantIssue.format);
        if (nextFormat && normalizeString(variantIssue.format) !== nextFormat) {
          variantIssue.format = nextFormat;
          variantChanged = true;
        }

        const nextVariantRelease = dateOnly(rawVariant.releasedate || variantIssue.releasedate);
        if (nextVariantRelease && dateOnly(variantIssue.releasedate) !== nextVariantRelease) {
          variantIssue.releasedate = nextVariantRelease;
          variantChanged = true;
        }

        const nextVariantPrice = normalizePrice(rawVariant.price);
        if (normalizePrice(variantIssue.price) !== nextVariantPrice) {
          variantIssue.price = nextVariantPrice;
          variantChanged = true;
        }

        const nextVariantCurrency =
          normalizeString(rawVariant.currency) || normalizeString(variantIssue.currency);
        if (nextVariantCurrency && normalizeString(variantIssue.currency) !== nextVariantCurrency) {
          variantIssue.currency = nextVariantCurrency;
          variantChanged = true;
        }

        if (variantChanged) {
          await variantIssue.save({ transaction });
          report.changes.push(`Updated variant issue "${variantName}".`);
        }
      }

      const variantCover = rawVariant.cover;
      if (!variantCover) continue;

      const ensuredVariantCover = await ensureMainCover(
        variantIssue.id,
        normalizeString(variantCover.url),
        toInt(variantCover.number),
        transaction,
      );
      if (ensuredVariantCover.changed) {
        report.changes.push(`Synchronized cover metadata for variant "${variantName}".`);
      }

      const variantCoverIndividuals = await syncCoverIndividuals(
        ensuredVariantCover.cover.id,
        (variantCover.individuals || []) as Array<{ name?: string; type?: string | string[] }>,
        transaction,
      );
      if (variantCoverIndividuals.changed) {
        report.changes.push(`Synchronized cover individuals for variant "${variantName}".`);
      }
    }

    const existingTargetVariants = (await models.Issue.findAll({
      where: {
        fk_series: targetSeries.id,
        number: mutableIssue.number,
        variant: { [Op.ne]: '' },
      },
      transaction,
    })) as IssueWithSeries[];

    for (const existingVariant of existingTargetVariants) {
      const variantName = normalizeString(existingVariant.variant);
      if (desiredVariantNames.has(variantName)) continue;

      const storyCount = await models.Story.count({
        where: { fk_issue: existingVariant.id },
        transaction,
      });

      if (storyCount > 0) {
        report.status = 'manual';
        report.conflicts.push(
          `Variant "${variantName}" exists locally but not in crawl and has ${storyCount} stories.`,
        );
        continue;
      }

      await models.Issue.destroy({ where: { id: existingVariant.id }, transaction });
      report.changes.push(`Removed obsolete variant "${variantName}".`);
    }
  }

  if (report.status !== 'manual') {
    if (report.changes.length > 0) report.status = 'updated';
    else report.status = 'skipped';
  }

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

export async function runReimport(options?: ReimportRunOptions): Promise<ReimportReport | null> {
  const dryRun = normalizeDryRun(options);
  const scope = options?.scope || defaultScope;
  const startedAt = new Date().toISOString();
  const crawler = new MarvelCrawlerService();

  try {
    const candidates = await loadIssuesForScope(scope);
    const rootIssues = dedupeBySeriesNumber(candidates);

    logger.info(`[reimport] starting run for ${rootIssues.length} issue roots (dryRun=${dryRun})`);

    const reports: ReimportIssueReport[] = [];

    for (let index = 0; index < rootIssues.length; index += 1) {
      const issue = rootIssues[index];
      logger.info(`[reimport] ${index + 1}/${rootIssues.length} - ${buildIssueLabel(issue)}`);
      const issueTransaction = await models.sequelize.transaction();
      try {
        const issueReport = await reimportIssue(issue, crawler, issueTransaction);
        reports.push(issueReport);

        if (dryRun) await issueTransaction.rollback();
        else await issueTransaction.commit();
      } catch (error) {
        await issueTransaction.rollback();
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[reimport] issue failed (${buildIssueLabel(issue)}): ${message}`);
        reports.push({
          issueId: issue.id,
          status: 'failed',
          label: buildIssueLabel(issue),
          notes: [],
          warnings: [message],
          conflicts: [],
          changes: [],
        });
      }
    }

    const summary = {
      total: reports.length,
      updated: reports.filter((entry) => entry.status === 'updated').length,
      skipped: reports.filter((entry) => entry.status === 'skipped').length,
      manual: reports.filter((entry) => entry.status === 'manual').length,
      failed: reports.filter((entry) => entry.status === 'failed').length,
    };

    const finishedAt = new Date().toISOString();
    const result: ReimportReport = {
      dryRun,
      startedAt,
      finishedAt,
      scope,
      summary,
      issues: reports,
    };

    return result;
  } catch (error) {
    logger.error(`[reimport] failed: ${(error as Error).message}`);
    return null;
  }
}

export async function triggerManualReimportDryRun(scope?: ReimportScope): Promise<ReimportReport | null> {
  return runReimport({ dryRun: true, scope: scope || defaultScope });
}
