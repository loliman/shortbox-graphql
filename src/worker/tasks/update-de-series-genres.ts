import { Task } from 'graphile-worker';
import { runUpdateDeSeriesGenres } from '../../core/update-de-series-genres';
import { persistTaskResult } from '../task-results';
import { UpdateDeSeriesGenresTaskPayload } from '../task-registry';

const task: Task = async (rawPayload, helpers) => {
  const payload = (rawPayload ?? {}) as UpdateDeSeriesGenresTaskPayload;
  const dryRun = Boolean(payload?.dryRun);

  try {
    const report = await runUpdateDeSeriesGenres({ dryRun });
    if (!report) {
      throw new Error('DE series genre update failed');
    }

    await persistTaskResult(helpers, 'update-de-series-genres', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary:
        `deSeries=${report.totalDeSeries}, mapped=${report.mappedDeSeries}, ` +
        `updated=${report.updatedSeries}, cleared=${report.clearedSeries}, dryRun=${report.dryRun}`,
      details: {
        result: report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistTaskResult(helpers, 'update-de-series-genres', {
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
