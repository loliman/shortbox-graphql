import { Op } from 'sequelize';
import models from '../models';
import logger from '../util/logger';

const MAX_SAMPLE_CHANGES = 50;

type DeSeriesRow = {
  id: number;
  genre: string;
};

type DeStoryRow = {
  fk_parent: number | null;
  issue?: {
    fk_series?: number | null;
  } | null;
};

type UsParentStoryRow = {
  id: number;
  issue?: {
    series?: {
      genre?: string | null;
    } | null;
  } | null;
};

export type UpdateDeSeriesGenresOptions = {
  dryRun?: boolean;
};

export type UpdateDeSeriesGenresChange = {
  seriesId: number;
  from: string;
  to: string;
};

export type UpdateDeSeriesGenresReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  totalDeSeries: number;
  processedDeStories: number;
  resolvedUsParentStories: number;
  mappedDeSeries: number;
  updatedSeries: number;
  unchangedSeries: number;
  clearedSeries: number;
  sampleChanges: UpdateDeSeriesGenresChange[];
};

const splitGenreTokens = (value: unknown): string[] =>
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const toUniqueSortedTokens = (values: string[]): string[] => {
  const unique = new Map<string, string>();

  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (!unique.has(key)) unique.set(key, normalized);
  });

  return [...unique.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
};

const serializeGenreTokens = (values: string[]): string => toUniqueSortedTokens(values).join(', ');

const normalizeGenreString = (value: unknown): string =>
  serializeGenreTokens(splitGenreTokens(value));

export async function runUpdateDeSeriesGenres(
  options?: UpdateDeSeriesGenresOptions,
): Promise<UpdateDeSeriesGenresReport | null> {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = new Date().toISOString();
  const transaction = await models.sequelize.transaction();

  try {
    const deSeries = (await models.Series.findAll({
      attributes: ['id', 'genre'],
      include: [
        {
          model: models.Publisher,
          as: 'publisher',
          attributes: [],
          where: { original: false },
          required: true,
        },
      ],
      raw: true,
      nest: true,
      transaction,
    })) as unknown as DeSeriesRow[];

    const deStories = (await models.Story.findAll({
      attributes: ['fk_parent'],
      where: { fk_parent: { [Op.ne]: null } },
      include: [
        {
          model: models.Issue,
          as: 'issue',
          attributes: ['fk_series'],
          required: true,
          include: [
            {
              model: models.Series,
              as: 'series',
              attributes: [],
              required: true,
              include: [
                {
                  model: models.Publisher,
                  as: 'publisher',
                  attributes: [],
                  where: { original: false },
                  required: true,
                },
              ],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
      transaction,
    })) as unknown as DeStoryRow[];

    const parentStoryIds = [...new Set(deStories.map((row) => Number(row.fk_parent || 0)))]
      .filter((id) => id > 0)
      .sort((left, right) => left - right);

    const usParentStories =
      parentStoryIds.length === 0
        ? []
        : ((await models.Story.findAll({
            attributes: ['id'],
            where: { id: { [Op.in]: parentStoryIds } },
            include: [
              {
                model: models.Issue,
                as: 'issue',
                attributes: [],
                required: true,
                include: [
                  {
                    model: models.Series,
                    as: 'series',
                    attributes: ['genre'],
                    required: true,
                    include: [
                      {
                        model: models.Publisher,
                        as: 'publisher',
                        attributes: [],
                        where: { original: true },
                        required: true,
                      },
                    ],
                  },
                ],
              },
            ],
            raw: true,
            nest: true,
            transaction,
          })) as unknown as UsParentStoryRow[]);

    const usGenreByParentStoryId = new Map<number, string>();
    usParentStories.forEach((row) => {
      const storyId = Number(row.id || 0);
      if (storyId <= 0) return;
      usGenreByParentStoryId.set(storyId, String(row.issue?.series?.genre || ''));
    });

    const genresByDeSeriesId = new Map<number, string[]>();
    deStories.forEach((deStory) => {
      const deSeriesId = Number(deStory.issue?.fk_series || 0);
      if (deSeriesId <= 0) return;

      const parentStoryId = Number(deStory.fk_parent || 0);
      if (parentStoryId <= 0) return;

      const usGenre = usGenreByParentStoryId.get(parentStoryId);
      if (typeof usGenre !== 'string' || usGenre.trim().length === 0) return;

      const current = genresByDeSeriesId.get(deSeriesId) || [];
      genresByDeSeriesId.set(deSeriesId, [...current, ...splitGenreTokens(usGenre)]);
    });

    let mappedDeSeries = 0;
    let updatedSeries = 0;
    let unchangedSeries = 0;
    let clearedSeries = 0;
    const sampleChanges: UpdateDeSeriesGenresChange[] = [];

    for (const deSeriesRow of deSeries) {
      const seriesId = Number(deSeriesRow.id || 0);
      if (seriesId <= 0) continue;

      const currentGenre = normalizeGenreString(deSeriesRow.genre);
      const nextGenre = serializeGenreTokens(genresByDeSeriesId.get(seriesId) || []);

      if (nextGenre.length > 0) mappedDeSeries += 1;

      if (nextGenre === currentGenre) {
        unchangedSeries += 1;
        continue;
      }

      updatedSeries += 1;
      if (nextGenre.length === 0) clearedSeries += 1;

      if (sampleChanges.length < MAX_SAMPLE_CHANGES) {
        sampleChanges.push({ seriesId, from: currentGenre, to: nextGenre });
      }

      if (!dryRun) {
        await models.Series.update(
          { genre: nextGenre },
          {
            where: { id: seriesId },
            transaction,
          },
        );
      }
    }

    const report: UpdateDeSeriesGenresReport = {
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      totalDeSeries: deSeries.length,
      processedDeStories: deStories.length,
      resolvedUsParentStories: usParentStories.length,
      mappedDeSeries,
      updatedSeries,
      unchangedSeries,
      clearedSeries,
      sampleChanges,
    };

    if (dryRun) await transaction.rollback();
    else await transaction.commit();

    logger.info(
      `[series-genres] completed (deSeries=${report.totalDeSeries}, mapped=${report.mappedDeSeries}, updated=${report.updatedSeries}, dryRun=${report.dryRun})`,
    );

    return report;
  } catch (error) {
    await transaction.rollback();
    logger.error(`[series-genres] run failed: ${(error as Error).message}`);
    return null;
  }
}
