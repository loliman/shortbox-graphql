import models from '../models';
import logger from '../util/logger';
import { updateStoryFilterFlagsForIssue } from '../util/FilterUpdater';

const DEFAULT_BATCH_SIZE = 250;

const parseBatchSize = (): number => {
  const fromEnv = Number.parseInt(process.env.STORY_FILTER_BATCH_SIZE || '', 10);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) return DEFAULT_BATCH_SIZE;
  return Math.trunc(fromEnv);
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

async function run(): Promise<void> {
  const batchSize = parseBatchSize();

  await models.sequelize.authenticate();
  logger.info('Story filter update: database connection established');

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
  });

  const issueIds = deIssues.map((issue) => Number(issue.id || 0)).filter((id) => id > 0);

  if (issueIds.length === 0) {
    logger.info('Story filter update: no DE issues found');
    return;
  }

  const batches = chunk(issueIds, batchSize);
  logger.info(
    `Story filter update: processing ${issueIds.length} DE issues in ${batches.length} batches (size=${batchSize})`,
  );

  let processed = 0;
  for (const [index, batch] of batches.entries()) {
    for (const issueId of batch) {
      await updateStoryFilterFlagsForIssue(models, issueId);
      processed += 1;
    }
    logger.info(
      `Story filter update: completed batch ${index + 1}/${batches.length} (${processed}/${issueIds.length})`,
    );
  }

  logger.info('Story filter update: completed successfully');
}

void run()
  .catch((error) => {
    logger.error(`Story filter update failed: ${(error as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await models.sequelize.close();
  });
