import models from '../models';
import { createNodeIssueLabel, createNodeSeriesLabel, createNodeUrl } from '../util/dbFunctions';
import logger from '../util/logger';

type SearchIndexInsertRow = {
  node_type: 'publisher' | 'series' | 'issue';
  source_id: number;
  us: boolean;
  publisher_name: string | null;
  series_title: string | null;
  series_volume: number | null;
  series_startyear: number | null;
  series_endyear: number | null;
  series_key: string | null;
  issue_number: string | null;
  issue_format: string | null;
  issue_variant: string | null;
  issue_title: string | null;
  label: string;
  url: string;
  search_text: string;
};

type PublisherSearchRow = {
  id: number;
  name: string;
  original: boolean;
};

type SeriesSearchRow = {
  id: number;
  title: string;
  volume: number;
  startyear: number;
  endyear: number | null;
  publisher: {
    name: string;
    original: boolean;
  };
};

type IssueSearchRow = {
  id: number;
  number: string;
  format: string;
  variant: string;
  title: string;
  series: {
    title: string;
    volume: number;
    startyear: number;
    endyear: number | null;
    publisher: {
      name: string;
      original: boolean;
    };
  };
};

type RebuildSearchIndexOptions = {
  dryRun?: boolean;
};

export type RebuildSearchIndexReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  totalRows: number;
  publisherRows: number;
  seriesRows: number;
  issueRows: number;
};

const INSERT_BATCH_SIZE = 2000;

export async function runRebuildSearchIndex(
  options?: RebuildSearchIndexOptions,
): Promise<RebuildSearchIndexReport | null> {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = new Date().toISOString();
  const transaction = await models.sequelize.transaction();

  try {
    const publishers = (await models.Publisher.findAll({ raw: true, transaction })) as unknown as PublisherSearchRow[];
    const series = (await models.Series.findAll({
      raw: true,
      nest: true,
      include: [{ model: models.Publisher, as: 'publisher', required: true }],
      transaction,
    })) as unknown as SeriesSearchRow[];
    const issues = (await models.Issue.findAll({
      raw: true,
      nest: true,
      include: [
        {
          model: models.Series,
          as: 'series',
          required: true,
          include: [{ model: models.Publisher, as: 'publisher', required: true }],
        },
      ],
      transaction,
    })) as unknown as IssueSearchRow[];

    const rows: SearchIndexInsertRow[] = [];
    let publisherRows = 0;
    let seriesRows = 0;
    let issueRows = 0;

    for (const publisher of publishers) {
      const us = Boolean(publisher.original);
      rows.push({
        node_type: 'publisher',
        source_id: publisher.id,
        us,
        publisher_name: publisher.name,
        series_title: null,
        series_volume: null,
        series_startyear: null,
        series_endyear: null,
        series_key: null,
        issue_number: null,
        issue_format: null,
        issue_variant: null,
        issue_title: null,
        label: publisher.name,
        url: createNodeUrl('publisher', us, publisher.name, '', 0, '', '', ''),
        search_text: normalizeSearchText(publisher.name),
      });
      publisherRows += 1;
    }

    for (const seriesItem of series) {
      const publisherName = seriesItem.publisher?.name || '';
      const us = Boolean(seriesItem.publisher?.original);
      const seriesTitle = seriesItem.title || '';
      const seriesKey = buildSeriesKey(
        publisherName,
        seriesTitle,
        seriesItem.volume,
        seriesItem.startyear,
      );
      const label = createNodeSeriesLabel(
        seriesTitle,
        publisherName,
        seriesItem.volume,
        seriesItem.startyear,
        seriesItem.endyear ?? 0,
      );

      rows.push({
        node_type: 'series',
        source_id: seriesItem.id,
        us,
        publisher_name: publisherName,
        series_title: seriesTitle,
        series_volume: seriesItem.volume,
        series_startyear: seriesItem.startyear,
        series_endyear: seriesItem.endyear ?? 0,
        series_key: seriesKey,
        issue_number: null,
        issue_format: null,
        issue_variant: null,
        issue_title: null,
        label,
        url: createNodeUrl('series', us, publisherName, seriesTitle, seriesItem.volume, '', '', ''),
        search_text: normalizeSearchText(
          `${publisherName} ${seriesTitle} vol ${seriesItem.volume} ${seriesItem.startyear} ${seriesItem.endyear || ''}`,
        ),
      });
      seriesRows += 1;
    }

    for (const issueItem of issues) {
      const seriesItem = issueItem.series;
      const publisherName = seriesItem?.publisher?.name || '';
      const us = Boolean(seriesItem?.publisher?.original);
      const seriesTitle = seriesItem?.title || '';
      const seriesVolume = Number(seriesItem?.volume || 0);
      const seriesStartyear = Number(seriesItem?.startyear || 0);
      const seriesEndyear = Number(seriesItem?.endyear || 0);
      const issueNumber = (issueItem.number || '').trim();
      const issueFormat = (issueItem.format || '').trim();
      const issueVariant = (issueItem.variant || '').trim();
      const issueTitle = (issueItem.title || '').trim();
      const seriesLabel = createNodeSeriesLabel(
        seriesTitle,
        publisherName,
        seriesVolume,
        seriesStartyear,
        seriesEndyear,
      );
      const label = createNodeIssueLabel(
        seriesLabel,
        issueNumber,
        issueFormat,
        issueVariant,
        issueTitle,
      );

      rows.push({
        node_type: 'issue',
        source_id: issueItem.id,
        us,
        publisher_name: publisherName,
        series_title: seriesTitle,
        series_volume: seriesVolume,
        series_startyear: seriesStartyear,
        series_endyear: seriesEndyear,
        series_key: buildSeriesKey(publisherName, seriesTitle, seriesVolume, seriesStartyear),
        issue_number: issueNumber,
        issue_format: issueFormat,
        issue_variant: issueVariant,
        issue_title: issueTitle,
        label,
        url: createNodeUrl(
          'issue',
          us,
          publisherName,
          seriesTitle,
          seriesVolume,
          issueNumber,
          issueFormat,
          issueVariant,
        ),
        search_text: normalizeSearchText(
          `${publisherName} ${seriesTitle} vol ${seriesVolume} ${seriesStartyear} ${seriesEndyear} ${issueNumber} ${issueFormat} ${issueVariant} ${issueTitle}`,
        ),
      });
      issueRows += 1;
    }

    await models.sequelize.query('TRUNCATE TABLE shortbox.search_index RESTART IDENTITY', {
      transaction,
    });

    const queryInterface = models.sequelize.getQueryInterface();
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
      await queryInterface.bulkInsert(
        { schema: 'shortbox', tableName: 'search_index' } as any,
        chunk as any[],
        { transaction },
      );
    }

    const report: RebuildSearchIndexReport = {
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalRows: rows.length,
      publisherRows,
      seriesRows,
      issueRows,
    };

    if (dryRun) {
      await transaction.rollback();
    } else {
      await transaction.commit();
    }

    logger.info(
      `[search-index] rebuild completed (rows=${report.totalRows}, dryRun=${report.dryRun})`,
    );
    return report;
  } catch (error) {
    await transaction.rollback();
    logger.error(`[search-index] rebuild failed: ${(error as Error).message}`);
    return null;
  }
}

function buildSeriesKey(
  publisherName: string,
  seriesTitle: string,
  seriesVolume: number,
  seriesStartyear: number,
): string {
  return [publisherName, seriesTitle, String(seriesVolume), String(seriesStartyear)].join('::');
}

function normalizeSearchText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
