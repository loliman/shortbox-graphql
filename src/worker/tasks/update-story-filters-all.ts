import { Task } from 'graphile-worker';
import { runUpdateStoryFilters } from '../../core/update-story-filters';
import { persistTaskResult } from '../task-results';
import { UpdateStoryFiltersTaskPayload } from '../task-registry';

const task: Task = async (rawPayload, helpers) => {
  const payload = (rawPayload ?? {}) as UpdateStoryFiltersTaskPayload;
  const dryRun = Boolean(payload?.dryRun);

  try {
    const report = await runUpdateStoryFilters({
      dryRun,
      batchSize: payload?.batchSize,
    });

    if (!report) {
      throw new Error('Story filter update run failed');
    }

    await persistTaskResult(helpers, 'update-story-filters-all', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary: `processed=${report.processed}/${report.issueCount}, batches=${report.batchCount}, dryRun=${report.dryRun}`,
      details: {
        result: report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistTaskResult(helpers, 'update-story-filters-all', {
      status: 'FAILED',
      dryRun,
      summary: message,
      details: {
        result: error instanceof Error ? error.stack || error.message : message,
      },
    });
    throw error;
  }
};

export default task;
