import { Task } from 'graphile-worker';
import { runReimport } from '../../core/reimport';
import { closeDbModels, createDbModels } from '../../core/db-model-factory';
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
  const enableTargetDeFastPath = Boolean(rawPayload?.enableTargetDeFastPath);
  const scope = rawPayload?.scope;

  if (!scope || scope.kind === 'all-us') {
    return { dryRun, enableTargetDeFastPath, scope: { kind: 'all-us' } };
  }

  if (scope.kind === 'publisher') {
    const publisherId = toPositiveInt(scope.publisherId);
    if (!publisherId) {
      throw new Error('Invalid reimport payload: publisherId must be a positive integer.');
    }
    return { dryRun, enableTargetDeFastPath, scope: { kind: 'publisher', publisherId } };
  }

  if (scope.kind === 'series') {
    const seriesId = toPositiveInt(scope.seriesId);
    if (!seriesId) {
      throw new Error('Invalid reimport payload: seriesId must be a positive integer.');
    }
    return { dryRun, enableTargetDeFastPath, scope: { kind: 'series', seriesId } };
  }

  const issueId = toPositiveInt(scope.issueId);
  if (!issueId) {
    throw new Error('Invalid reimport payload: issueId must be a positive integer.');
  }
  return { dryRun, enableTargetDeFastPath, scope: { kind: 'issue', issueId } };
};

const task: Task = async (rawPayload, helpers) => {
  const payload = normalizePayload((rawPayload ?? {}) as ReimportUSTaskPayload);
  const dryRun = payload.dryRun;
  const targetModels = dryRun ? null : createDbModels('shortbox_migration');

  try {
    const report = await runReimport({
      dryRun,
      enableTargetDeFastPath: payload.enableTargetDeFastPath,
      scope: payload?.scope,
      targetModels: targetModels || undefined,
    });

    if (!report) {
      throw new Error('US reimport run failed');
    }

    await persistTaskResult(helpers, 'reimport-us', {
      status: 'SUCCESS',
      dryRun: report.dryRun,
      summary:
        `deSeries=${report.summary.totalDeSeries}, ` +
        `deIssues=${report.summary.totalDeIssues}, ` +
        `usIssues=${report.summary.totalMappedUsIssues}, ` +
        `shortbox=${report.summary.results.shortbox}, ` +
        `crawler=${report.summary.results.crawler}, ` +
        `moved=${report.summary.results.moved}, ` +
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
  } finally {
    await closeDbModels(targetModels || undefined);
  }
};

export default task;
