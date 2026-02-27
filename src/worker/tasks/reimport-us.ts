import { Task } from 'graphile-worker';
import { runReimport } from '../../core/reimport';
import { persistTaskResult } from '../task-results';
import { ReimportUSTaskPayload } from '../task-registry';

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
};

const normalizePayload = (rawPayload: ReimportUSTaskPayload): ReimportUSTaskPayload => {
  const dryRun = Boolean(rawPayload?.dryRun);
  const scope = rawPayload?.scope;

  if (!scope || scope.kind === 'all-us') {
    return { dryRun, scope: { kind: 'all-us' } };
  }

  if (scope.kind === 'publisher') {
    const publisherId = toPositiveInt(scope.publisherId);
    if (!publisherId) {
      throw new Error('Invalid reimport payload: publisherId must be a positive integer.');
    }
    return { dryRun, scope: { kind: 'publisher', publisherId } };
  }

  if (scope.kind === 'series') {
    const seriesId = toPositiveInt(scope.seriesId);
    if (!seriesId) {
      throw new Error('Invalid reimport payload: seriesId must be a positive integer.');
    }
    return { dryRun, scope: { kind: 'series', seriesId } };
  }

  const issueId = toPositiveInt(scope.issueId);
  if (!issueId) {
    throw new Error('Invalid reimport payload: issueId must be a positive integer.');
  }
  return { dryRun, scope: { kind: 'issue', issueId } };
};

const task: Task = async (rawPayload, helpers) => {
  const payload = normalizePayload((rawPayload ?? {}) as ReimportUSTaskPayload);
  const dryRun = payload.dryRun;

  try {
    const report = await runReimport({
      dryRun,
      scope: payload?.scope,
    });

    if (!report) {
      throw new Error('US reimport run failed');
    }

    await persistTaskResult(helpers, 'reimport-us', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary:
        `changedPublishers=${report.result.changedPublishers}, ` +
        `changedSeries=${report.result.changedSeries}, ` +
        `changedIssues=${report.result.changedIssues}, ` +
        `normalizedIssues=${report.result.normalizedIssues}, ` +
        `updatedIssues=${report.result.updatedIssues}, ` +
        `conflictIssues=${report.result.conflictIssues}, ` +
        `failedIssues=${report.result.failedIssues}, ` +
        `conflictSeries=${report.result.conflictSeries}, ` +
        `notFoundSeries=${report.result.notFoundSeries}, ` +
        `failedSeries=${report.result.failedSeries}, ` +
        `failedPublishers=${report.result.failedPublishers}, ` +
        `dryRun=${report.dryRun}`,
      details: {
        result: report,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistTaskResult(helpers, 'reimport-us', {
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
