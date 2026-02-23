import models from '../models';
import logger from '../util/logger';
import { updateStoryFilterFlagsForIssue } from '../util/FilterUpdater';

const DEFAULT_BATCH_SIZE = 250;

export type UpdateStoryFiltersOptions = {
  dryRun?: boolean;
  batchSize?: number;
};

export type UpdateStoryFiltersReport = {
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  issueCount: number;
  batchSize: number;
  batchCount: number;
  processed: number;
};

const resolveBatchSize = (value?: number): number => {
  const envBatchSize = Number.parseInt(process.env.STORY_FILTER_BATCH_SIZE || '', 10);
  const selected = typeof value === 'number' ? value : envBatchSize;
  if (!Number.isFinite(selected) || selected <= 0) return DEFAULT_BATCH_SIZE;
  return Math.trunc(selected);
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export async function runUpdateStoryFilters(
  options?: UpdateStoryFiltersOptions,
): Promise<UpdateStoryFiltersReport | null> {
  const dryRun = Boolean(options?.dryRun);
  const batchSize = resolveBatchSize(options?.batchSize);
  const startedAt = new Date().toISOString();
  const transaction = await models.sequelize.transaction();

  try {
    const deIssues = await models.Issue.findAll({
      attributes: ['id'],
      include: [
        {
          model: models.Series,
          as: 'series',
          attributes: ['id'],
          required: true,
          include: [
            {
              model: models.Publisher,
              as: 'publisher',
              attributes: ['id'],
              where: { original: false },
              required: true,
            },
          ],
        },
      ],
      transaction,
    });

    const issueIds = deIssues.map((issue) => Number(issue.id || 0)).filter((id) => id > 0);
    const batches = chunk(issueIds, batchSize);

    logger.info(
      `[story-filters] processing ${issueIds.length} DE issues in ${batches.length} batches (size=${batchSize}, dryRun=${dryRun})`,
    );

    let processed = 0;

    for (const [index, batch] of batches.entries()) {
      if (!dryRun) {
        for (const issueId of batch) {
          await updateStoryFilterFlagsForIssue(models, issueId, transaction);
          processed += 1;
        }
      }

      logger.info(
        `[story-filters] completed batch ${index + 1}/${batches.length} (${dryRun ? processed : processed}/${issueIds.length})`,
      );

      if (dryRun) {
        processed += batch.length;
      }
    }

    const report: UpdateStoryFiltersReport = {
      dryRun,
      startedAt,
      finishedAt: new Date().toISOString(),
      issueCount: issueIds.length,
      batchSize,
      batchCount: batches.length,
      processed,
    };

    if (dryRun) await transaction.rollback();
    else await transaction.commit();

    return report;
  } catch (error) {
    await transaction.rollback();
    logger.error(`[story-filters] run failed: ${(error as Error).message}`);
    return null;
  }
}
