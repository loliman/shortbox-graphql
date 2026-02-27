import { Op, Transaction } from 'sequelize';
import axios from 'axios';
import models from '../models';
import logger from '../util/logger';
import { MarvelCrawlerService } from '../services/MarvelCrawlerService';

type ReimportScope =
  | { kind: 'all-us' }
  | { kind: 'publisher'; publisherId: number }
  | { kind: 'series'; seriesId: number }
  | { kind: 'issue'; issueId: number };

export type ReimportRunOptions = {
  dryRun?: boolean;
  scope?: ReimportScope;
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
    notFoundSeries: number;
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

const defaultScope: ReimportScope = { kind: 'all-us' };
const SERIES_BATCH_SIZE = 25;
const MARVEL_API_URI = 'https://marvel.fandom.com/api.php';
const MARVEL_REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://marvel.fandom.com/',
};

const normalizeDryRun = (options?: ReimportRunOptions): boolean => {
  if (typeof options?.dryRun === 'boolean') return options.dryRun;
  return String(process.env.REIMPORT_DRY_RUN || 'false').toLowerCase() === 'true';
};

const normalizeString = (value: unknown): string => String(value || '').trim();
const normalizeLower = (value: unknown): string => normalizeString(value).toLowerCase();

const toInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const toWikiSeriesPageTitle = (title: string, volume: number): string =>
  `${normalizeString(title).replace(/\s+/g, '_')}_Vol_${toInt(volume)}`;

const fromWikiSeriesPageTitle = (pageTitle: string): { title: string; volume: number } | null => {
  const raw = normalizeString(pageTitle);
  const match = raw.match(/^(.*)_Vol_(\d+)$/i);
  if (!match) return null;
  const title = normalizeString(match[1]).replace(/_/g, ' ');
  const volume = toInt(match[2]);
  if (!title || !volume) return null;
  return { title, volume };
};

type SeriesPageProbe =
  | { state: 'missing' }
  | { state: 'found' }
  | { state: 'redirect'; targetPageTitle: string };

const probeSeriesPage = async (title: string, volume: number): Promise<SeriesPageProbe> => {
  const wikiTitle = toWikiSeriesPageTitle(title, volume);
  const response = (await axios.get(MARVEL_API_URI, {
    params: {
      action: 'query',
      format: 'json',
      redirects: 1,
      titles: wikiTitle,
    },
    headers: MARVEL_REQUEST_HEADERS,
  })) as {
    data?: {
      query?: {
        redirects?: Array<{ from?: string; to?: string }>;
        pages?: Record<string, { missing?: unknown }>;
      };
    };
  };

  const redirects = response.data?.query?.redirects || [];
  const redirectEntry = redirects.find(
    (entry) => normalizeLower(entry.from) === normalizeLower(wikiTitle),
  );
  if (redirectEntry?.to) {
    return { state: 'redirect', targetPageTitle: String(redirectEntry.to) };
  }

  const pages = response.data?.query?.pages || {};
  const pageList = Object.values(pages);
  const hasMissing = pageList.some((page) => Object.prototype.hasOwnProperty.call(page, 'missing'));
  if (hasMissing) return { state: 'missing' };
  return { state: 'found' };
};

const loadSeriesBatchForScope = async (
  scope: ReimportScope,
  offset: number,
  limit: number,
  transaction?: Transaction,
): Promise<SeriesWithPublisher[]> => {
  if (scope.kind === 'series') {
    if (offset > 0) return [];
    return (await models.Series.findAll({
      where: { id: scope.seriesId },
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
      transaction,
    })) as unknown as SeriesWithPublisher[];
  }

  if (scope.kind === 'issue') {
    if (offset > 0) return [];
    const issue = await models.Issue.findByPk(scope.issueId, {
      attributes: ['fk_series'],
      transaction,
    });
    if (!issue?.fk_series) return [];

    return (await models.Series.findAll({
      where: { id: issue.fk_series },
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
      transaction,
    })) as unknown as SeriesWithPublisher[];
  }

  const where: Record<string, unknown> = {};
  const include = [
    {
      model: models.Publisher,
      as: 'publisher',
      required: true,
      ...(scope.kind === 'all-us' ? { where: { original: true } } : {}),
    },
  ];

  if (scope.kind === 'publisher') {
    where.fk_publisher = scope.publisherId;
  }

  return (await models.Series.findAll({
    where,
    include,
    order: [['id', 'ASC']],
    offset,
    limit,
    transaction,
  })) as unknown as SeriesWithPublisher[];
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

type SeriesTarget = {
  title: string;
  volume: number;
  startyear: number;
  endyear: number;
  publisherName: string;
};

const applySeriesTarget = async (
  localSeries: SeriesWithPublisher,
  target: SeriesTarget,
  transaction: Transaction,
): Promise<{ status: 'UPDATED' | 'UNCHANGED' | 'CONFLICT'; publisherChanged: boolean }> => {
  const normalizedTitle = normalizeString(target.title) || normalizeString(localSeries.title);
  const normalizedVolume = toInt(target.volume) || toInt(localSeries.volume);
  const normalizedPublisherName = normalizeString(target.publisherName) || 'Marvel Comics';
  const normalizedStartyear = toInt(target.startyear) || toInt(localSeries.startyear);
  const normalizedEndyear = toInt(target.endyear) || toInt(localSeries.endyear);

  const { publisher, created, updatedOriginal } = await findOrCreatePublisher(
    normalizedPublisherName,
    transaction,
  );

  const conflictingSeries = await models.Series.findOne({
    where: {
      title: normalizedTitle,
      volume: normalizedVolume,
      id: { [Op.ne]: localSeries.id },
    },
    transaction,
  });

  if (conflictingSeries) {
    return { status: 'CONFLICT', publisherChanged: created || updatedOriginal };
  }

  const patch: Record<string, unknown> = {};
  if (normalizeString(localSeries.title) !== normalizedTitle) patch.title = normalizedTitle;
  if (toInt(localSeries.volume) !== normalizedVolume) patch.volume = normalizedVolume;
  if (toInt(localSeries.fk_publisher) !== toInt(publisher.id))
    patch.fk_publisher = toInt(publisher.id);
  if (toInt(localSeries.startyear) !== normalizedStartyear) patch.startyear = normalizedStartyear;
  if (toInt(localSeries.endyear) !== normalizedEndyear) patch.endyear = normalizedEndyear;

  if (Object.keys(patch).length === 0) {
    return { status: 'UNCHANGED', publisherChanged: created || updatedOriginal };
  }

  await models.Series.update(patch, {
    where: { id: localSeries.id },
    transaction,
  });

  return { status: 'UPDATED', publisherChanged: true };
};

export async function runReimport(options?: ReimportRunOptions): Promise<ReimportReport | null> {
  const dryRun = normalizeDryRun(options);
  const scope = options?.scope || defaultScope;
  const startedAt = new Date().toISOString();
  const crawler = new MarvelCrawlerService();

  try {
    logger.info(
      `[reimport] starting series-based run (dryRun=${dryRun}, scope=${scope.kind}, batchSize=${SERIES_BATCH_SIZE})`,
    );

    const changedPublisherKeys = new Set<string>();
    let changedSeries = 0;
    let conflictSeries = 0;
    let notFoundSeries = 0;
    let failedSeries = 0;
    let failedPublishers = 0;
    let processedSeries = 0;

    let offset = 0;
    let batchNumber = 0;

    while (true) {
      const seriesBatch = await loadSeriesBatchForScope(scope, offset, SERIES_BATCH_SIZE);
      if (seriesBatch.length === 0) break;

      offset += seriesBatch.length;
      batchNumber += 1;
      logger.info(`[reimport] series batch ${batchNumber} (${seriesBatch.length} series)`);

      for (const localSeries of seriesBatch) {
        processedSeries += 1;
        const localTitle = normalizeString(localSeries.title);
        const localVolume = toInt(localSeries.volume);

        const transaction = await models.sequelize.transaction();
        try {
          let target: SeriesTarget | null = null;

          try {
            const crawledSeries = await crawler.crawlSeries(localTitle, localVolume);
            target = {
              title: normalizeString(crawledSeries.title) || localTitle,
              volume: toInt(crawledSeries.volume) || localVolume,
              startyear: toInt(crawledSeries.startyear),
              endyear: toInt(crawledSeries.endyear),
              publisherName: normalizeString(crawledSeries.publisherName) || 'Marvel Comics',
            };
          } catch (seriesError) {
            const pageProbe = await probeSeriesPage(localTitle, localVolume);
            if (pageProbe.state === 'missing') {
              notFoundSeries += 1;
              if (dryRun) await transaction.rollback();
              else await transaction.commit();
              console.log(
                `[reimport][series] ${processedSeries} ${localTitle} (Vol. ${localVolume}) NOT_FOUND`,
              );
              continue;
            }

            if (pageProbe.state === 'redirect') {
              const parsedRedirect = fromWikiSeriesPageTitle(pageProbe.targetPageTitle);
              if (!parsedRedirect) {
                throw new Error(
                  `Cannot parse redirected series target "${pageProbe.targetPageTitle}"`,
                );
              }

              target = {
                title: parsedRedirect.title,
                volume: parsedRedirect.volume,
                startyear: toInt(localSeries.startyear),
                endyear: toInt(localSeries.endyear),
                publisherName: normalizeString(localSeries.publisher?.name) || 'Marvel Comics',
              };

              // try to enrich publisher/year data from first issue of old route
              try {
                const crawledIssue = await crawler.crawlIssue(localTitle, localVolume, '1');
                target.title = normalizeString(crawledIssue.seriesTitle) || target.title;
                target.volume = toInt(crawledIssue.seriesVolume) || target.volume;
                target.startyear = toInt(crawledIssue.seriesStartyear) || target.startyear;
                target.endyear = toInt(crawledIssue.seriesEndyear) || target.endyear;
                target.publisherName =
                  normalizeString(crawledIssue.seriesPublisherName) || target.publisherName;
              } catch {
                // best-effort enrichment only
              }
            } else {
              // page exists but crawl failed for another reason (e.g. transient 403/rate-limit/parsing).
              throw seriesError;
            }
          }

          const applyResult = await applySeriesTarget(localSeries, target, transaction);

          if (applyResult.publisherChanged) {
            changedPublisherKeys.add(normalizeLower(target.publisherName));
          }

          if (applyResult.status === 'CONFLICT') {
            conflictSeries += 1;
            if (dryRun) await transaction.rollback();
            else await transaction.commit();
            console.log(
              `[reimport][series] ${processedSeries} ${localTitle} (Vol. ${localVolume}) CONFLICT`,
            );
            continue;
          }

          if (applyResult.status === 'UPDATED') {
            changedSeries += 1;
          }

          if (dryRun) await transaction.rollback();
          else await transaction.commit();

          console.log(
            `[reimport][series] ${processedSeries} ${localTitle} (Vol. ${localVolume}) ${applyResult.status}`,
          );
        } catch (error) {
          await transaction.rollback();
          const message = error instanceof Error ? error.message : String(error);
          failedSeries += 1;
          if (message.toLowerCase().includes('publisher')) failedPublishers += 1;
          logger.warn(`[reimport] series failed ${localTitle} (Vol. ${localVolume}): ${message}`);
          console.log(
            `[reimport][series] ${processedSeries} ${localTitle} (Vol. ${localVolume}) FAILED: ${message}`,
          );
        }
      }
    }

    const finishedAt = new Date().toISOString();
    return {
      dryRun,
      startedAt,
      finishedAt,
      scope,
      result: {
        changedPublishers: changedPublisherKeys.size,
        changedSeries,
        changedIssues: 0,
        normalizedIssues: 0,
        updatedIssues: 0,
        conflictIssues: 0,
        failedIssues: 0,
        conflictSeries,
        notFoundSeries,
        failedSeries,
        failedPublishers,
      },
    };
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
