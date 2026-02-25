import { Task } from 'graphile-worker';
import { runRebuildSearchIndex } from '../../core/rebuild-search-index';
import { persistTaskResult } from '../task-results';
import { RebuildSearchIndexTaskPayload } from '../task-registry';

const task: Task = async (rawPayload, helpers) => {
  const payload = (rawPayload ?? {}) as RebuildSearchIndexTaskPayload;
  const dryRun = Boolean(payload?.dryRun);

  try {
    const report = await runRebuildSearchIndex({ dryRun });
    if (!report) {
      throw new Error('Search index rebuild failed');
    }

    await persistTaskResult(helpers, 'rebuild-search-index', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary:
        `totalRows=${report.totalRows}, publishers=${report.publisherRows}, ` +
        `series=${report.seriesRows}, issues=${report.issueRows}, dryRun=${report.dryRun}`,
      details: {
        result: report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistTaskResult(helpers, 'rebuild-search-index', {
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
