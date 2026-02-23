import { Task } from 'graphile-worker';
import { run as runCleanup } from '../../core/cleanup';
import { persistTaskResult } from '../task-results';
import { CleanupTaskPayload } from '../task-registry';

const task: Task = async (rawPayload, helpers) => {
  const payload = (rawPayload ?? {}) as CleanupTaskPayload;
  const dryRun = Boolean(payload?.dryRun);

  try {
    const report = await runCleanup({ dryRun });
    if (!report) {
      throw new Error('Cleanup run failed');
    }

    await persistTaskResult(helpers, 'cleanup', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary: `affected=${report.totalAffected}, stages=${report.stages.length}, dryRun=${report.dryRun}`,
      details: {
        result: report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistTaskResult(helpers, 'cleanup', {
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
