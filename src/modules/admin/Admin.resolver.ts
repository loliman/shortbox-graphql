import { GraphQLError } from 'graphql';
import { QueryTypes } from 'sequelize';
import models from '../../models';
import { getWorkerUtils } from '../../lib/workerUtils';
import {
  ADMIN_TASK_DEFINITION_BY_NAME,
  ADMIN_TASK_DEFINITIONS,
  AdminTaskDefinition,
  AdminTaskName,
  AdminTaskPayloads,
  isAdminTaskName,
} from '../../worker/task-registry';

type AdminTaskRunStatus = 'SUCCESS' | 'FAILED';

type AdminTaskRunRecord = {
  id: string;
  taskKey: string;
  taskName: string;
  startedAt: string;
  finishedAt: string | null;
  dryRun: boolean;
  status: AdminTaskRunStatus;
  summary: string;
  details: string | null;
};

type WorkerState = 'queued' | 'running' | 'failed-awaiting-retry';

type TaskResultRow = {
  id: number;
  job_id: string;
  task_identifier: string;
  result_json: string;
  created_at: Date;
};

type JobViewRow = {
  id: string | number;
  task_identifier: string;
  run_at: Date | null;
  created_at: Date;
  locked_at: Date | null;
  locked_by?: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
};

type RunAdminTaskInput = {
  taskKey: string;
  dryRun?: boolean;
  reimportScopeKind?: 'ALL_US' | 'PUBLISHER' | 'SERIES' | 'ISSUE';
  publisherId?: string;
  seriesId?: string;
  issueId?: string;
};

const requireLogin = (loggedIn: boolean) => {
  if (!loggedIn) {
    throw new GraphQLError('Du bist nicht eingeloggt', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
};

const toIso = (value: Date | string | null): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toDetailsText = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const parseTaskResult = (
  row: TaskResultRow,
): {
  status: AdminTaskRunStatus;
  dryRun: boolean;
  summary: string;
  details: string | null;
  workerState: WorkerState | null;
} => {
  try {
    const parsed = JSON.parse(row.result_json) as {
      status?: AdminTaskRunStatus;
      dryRun?: boolean;
      summary?: string;
      details?: unknown;
    };
    const detailsText = toDetailsText(parsed.details);
    let workerState: WorkerState | null = null;

    if (parsed.details && typeof parsed.details === 'object') {
      const rawState = (parsed.details as { state?: unknown }).state;
      if (rawState === 'queued' || rawState === 'running' || rawState === 'failed-awaiting-retry') {
        workerState = rawState;
      }
    } else if (detailsText) {
      try {
        const detailsParsed = JSON.parse(detailsText) as { state?: unknown };
        if (
          detailsParsed.state === 'queued' ||
          detailsParsed.state === 'running' ||
          detailsParsed.state === 'failed-awaiting-retry'
        ) {
          workerState = detailsParsed.state;
        }
      } catch {
        workerState = null;
      }
    }

    return {
      status:
        parsed.status === 'FAILED' || workerState === 'failed-awaiting-retry'
          ? 'FAILED'
          : 'SUCCESS',
      dryRun: Boolean(parsed.dryRun),
      summary: String(parsed.summary || 'Task completed'),
      details: detailsText,
      workerState,
    };
  } catch {
    return {
      status: 'SUCCESS',
      dryRun: false,
      summary: 'Task completed',
      details: row.result_json,
      workerState: null,
    };
  }
};

const mapResultRowToRun = (task: AdminTaskDefinition, row: TaskResultRow): AdminTaskRunRecord => {
  const parsed = parseTaskResult(row);
  const summaryLower = parsed.summary.toLowerCase();
  const isPending =
    parsed.workerState === 'queued' ||
    parsed.workerState === 'running' ||
    parsed.workerState === 'failed-awaiting-retry' ||
    summaryLower.includes('queued') ||
    summaryLower.includes('running') ||
    summaryLower.includes('waiting for retry');

  return {
    id: String(row.job_id),
    taskKey: task.name,
    taskName: task.label,
    startedAt: toIso(row.created_at) || new Date().toISOString(),
    finishedAt: isPending ? null : toIso(row.created_at),
    dryRun: parsed.dryRun,
    status: parsed.status,
    summary: parsed.summary,
    details: parsed.details,
  };
};

const mapQueuedRowToRun = (
  task: AdminTaskDefinition,
  row: JobViewRow,
  dryRun = false,
): AdminTaskRunRecord => {
  const workerState = row.last_error
    ? 'failed-awaiting-retry'
    : row.locked_at
      ? 'running'
      : 'queued';

  const details = {
    state: workerState,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
  };

  return {
    id: String(row.id),
    taskKey: task.name,
    taskName: task.label,
    startedAt: toIso(row.run_at) || toIso(row.created_at) || new Date().toISOString(),
    finishedAt: null,
    dryRun,
    status: row.last_error ? 'FAILED' : 'SUCCESS',
    summary: row.last_error
      ? 'Job failed and is waiting for retry'
      : row.locked_at
        ? 'Job running'
        : 'Job queued',
    details: JSON.stringify(details, null, 2),
  };
};

const listTaskRuns = async (limitRuns: number) => {
  const taskNames = ADMIN_TASK_DEFINITIONS.map((task) => task.name);

  const resultRows = (await models.sequelize.query(
    `
    SELECT id, job_id, task_identifier, result_json, created_at
    FROM (
      SELECT
        id,
        job_id,
        task_identifier,
        result_json,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY task_identifier ORDER BY created_at DESC, id DESC) AS rn
      FROM shortbox.admin_task_result
      WHERE task_identifier IN (:taskNames)
    ) ranked
    WHERE ranked.rn <= :limitRuns
    ORDER BY task_identifier ASC, created_at DESC, id DESC
    `,
    {
      replacements: { taskNames, limitRuns },
      type: QueryTypes.SELECT,
    },
  )) as TaskResultRow[];

  const queuedRows = (await models.sequelize.query(
    `
    SELECT id, task_identifier, run_at, created_at, locked_at, attempts, max_attempts, last_error
    FROM (
      SELECT
        id,
        task_identifier,
        run_at,
        created_at,
        locked_at,
        attempts,
        max_attempts,
        last_error,
        ROW_NUMBER() OVER (PARTITION BY task_identifier ORDER BY created_at DESC, id DESC) AS rn
      FROM graphile_worker.jobs
      WHERE task_identifier IN (:taskNames)
    ) queued
    WHERE queued.rn <= :limitRuns
    ORDER BY task_identifier ASC, created_at DESC, id DESC
    `,
    {
      replacements: { taskNames, limitRuns },
      type: QueryTypes.SELECT,
    },
  )) as JobViewRow[];

  const runsByTask = new Map<AdminTaskName, AdminTaskRunRecord[]>();

  for (const task of ADMIN_TASK_DEFINITIONS) {
    runsByTask.set(task.name, []);
  }

  for (const row of resultRows) {
    if (!isAdminTaskName(row.task_identifier)) continue;
    const task = ADMIN_TASK_DEFINITION_BY_NAME[row.task_identifier];
    runsByTask.get(row.task_identifier)?.push(mapResultRowToRun(task, row));
  }

  for (const row of queuedRows) {
    if (!isAdminTaskName(row.task_identifier)) continue;
    const existingRuns = runsByTask.get(row.task_identifier) || [];
    const existingRunIndex = existingRuns.findIndex((run) => run.id === String(row.id));

    const task = ADMIN_TASK_DEFINITION_BY_NAME[row.task_identifier];
    if (existingRunIndex >= 0) {
      const existingRun = existingRuns[existingRunIndex];
      const shouldRefreshTransientState = existingRun.finishedAt === null;
      if (shouldRefreshTransientState) {
        existingRuns[existingRunIndex] = mapQueuedRowToRun(task, row, existingRun.dryRun);
      }
      runsByTask.set(row.task_identifier, existingRuns);
      continue;
    }

    existingRuns.push(mapQueuedRowToRun(task, row));
    runsByTask.set(row.task_identifier, existingRuns);
  }

  for (const [taskName, runs] of runsByTask.entries()) {
    runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    runsByTask.set(taskName, runs.slice(0, limitRuns));
  }

  return runsByTask;
};

const normalizeLimitRuns = (limitRuns?: number): number => {
  if (!Number.isFinite(limitRuns) || Number(limitRuns) <= 0) return 10;
  return Math.min(Math.trunc(Number(limitRuns)), 50);
};

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
};

const buildTaskPayload = (
  taskKey: AdminTaskName,
  input: RunAdminTaskInput,
): AdminTaskPayloads[AdminTaskName] => {
  const dryRun = Boolean(input.dryRun);

  if (taskKey === 'cleanup-db') {
    return { dryRun };
  }

  if (taskKey === 'update-story-badges') {
    return { dryRun };
  }

  if (taskKey === 'reimport-us') {
    const scopeKind = input.reimportScopeKind;
    if (!scopeKind || scopeKind === 'ALL_US') {
      return { dryRun, scope: { kind: 'all-us' } };
    }

    if (scopeKind === 'PUBLISHER') {
      const publisherId = parsePositiveInt(input.publisherId);
      if (!publisherId) throw new GraphQLError('publisherId is required for PUBLISHER scope');
      return { dryRun, scope: { kind: 'publisher', publisherId } };
    }

    if (scopeKind === 'SERIES') {
      const seriesId = parsePositiveInt(input.seriesId);
      if (!seriesId) throw new GraphQLError('seriesId is required for SERIES scope');
      return { dryRun, scope: { kind: 'series', seriesId } };
    }

    if (scopeKind === 'ISSUE') {
      const issueId = parsePositiveInt(input.issueId);
      if (!issueId) throw new GraphQLError('issueId is required for ISSUE scope');
      return { dryRun, scope: { kind: 'issue', issueId } };
    }
  }

  if (taskKey === 'rebuild-search-index') {
    return { dryRun };
  }

  return { dryRun };
};

export const resolvers = {
  Query: {
    adminTasks: async (
      _: unknown,
      args: { limitRuns?: number },
      context: { loggedIn: boolean },
    ) => {
      requireLogin(context.loggedIn);
      const limitRuns = normalizeLimitRuns(args.limitRuns);
      const runsByTask = await listTaskRuns(limitRuns);

      return ADMIN_TASK_DEFINITIONS.map((task) => {
        const runs = runsByTask.get(task.name) || [];

        return {
          id: task.name,
          key: task.name,
          name: task.label,
          description: task.description,
          lastRun: runs[0] || null,
          runs,
        };
      });
    },
  },
  Mutation: {
    runAdminTask: async (
      _: unknown,
      args: { input: RunAdminTaskInput },
      context: { loggedIn: boolean },
    ) => {
      requireLogin(context.loggedIn);

      const taskKey = String(args?.input?.taskKey || '').trim();
      if (!isAdminTaskName(taskKey)) {
        throw new GraphQLError(`Unknown admin task: ${taskKey}`, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const payload = buildTaskPayload(taskKey, args.input);

      const workerUtils = await getWorkerUtils();
      const job = await workerUtils.addJob(taskKey, payload, { maxAttempts: 1 });
      const now = new Date().toISOString();
      const queuedDetails = {
        state: 'queued',
        attempts: 0,
        maxAttempts: 1,
        lastError: null,
      };

      await models.sequelize.query(
        `
        INSERT INTO shortbox.admin_task_result (job_id, task_identifier, result_json, created_at)
        VALUES (:jobId, :taskIdentifier, :resultJson, NOW())
        ON CONFLICT (job_id)
        DO UPDATE SET
          task_identifier = EXCLUDED.task_identifier,
          result_json = EXCLUDED.result_json,
          created_at = EXCLUDED.created_at
        `,
        {
          replacements: {
            jobId: String(job.id),
            taskIdentifier: taskKey,
            resultJson: JSON.stringify({
              status: 'SUCCESS',
              dryRun: Boolean(payload.dryRun),
              summary: 'Job queued',
              details: queuedDetails,
            }),
          },
          type: QueryTypes.INSERT,
        },
      );

      return {
        id: String(job.id),
        taskKey,
        taskName: ADMIN_TASK_DEFINITION_BY_NAME[taskKey].label,
        startedAt: now,
        finishedAt: null,
        dryRun: Boolean(payload.dryRun),
        status: 'SUCCESS',
        summary: `Job queued (${job.id})`,
        details: JSON.stringify({ payload, ...queuedDetails }, null, 2),
      };
    },
    releaseAllAdminTaskLocks: async (_: unknown, __: unknown, context: { loggedIn: boolean }) => {
      requireLogin(context.loggedIn);

      const taskNames = ADMIN_TASK_DEFINITIONS.map((task) => task.name);
      const lockedWorkers = (await models.sequelize.query(
        `
        SELECT DISTINCT locked_by
        FROM graphile_worker.jobs
        WHERE locked_at IS NOT NULL
          AND locked_by IS NOT NULL
          AND task_identifier IN (:taskNames)
        `,
        {
          replacements: { taskNames },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ locked_by: string | null }>;

      const workerIds = lockedWorkers
        .map((row) => String(row.locked_by || '').trim())
        .filter((workerId) => workerId.length > 0);

      const workerUtils = await getWorkerUtils();
      if (workerIds.length > 0) {
        await workerUtils.forceUnlockWorkers(workerIds);
      }

      const jobRows = (await models.sequelize.query(
        `
        SELECT id
        FROM graphile_worker.jobs
        WHERE task_identifier IN (:taskNames)
        `,
        {
          replacements: { taskNames },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: string | number }>;

      const jobIds = jobRows.map((row) => String(row.id)).filter((jobId) => jobId.length > 0);

      let removedCount = 0;
      if (jobIds.length > 0) {
        const completed = await workerUtils.completeJobs(jobIds);
        removedCount = completed.length;
      }

      const remainingJobs = (await models.sequelize.query(
        `
        SELECT id
        FROM graphile_worker.jobs
        WHERE task_identifier IN (:taskNames)
        `,
        {
          replacements: { taskNames },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ id: string | number }>;
      const remainingJobIds = new Set(
        remainingJobs.map((row) => String(row.id)).filter((jobId) => jobId.length > 0),
      );

      const resultRows = (await models.sequelize.query(
        `
        SELECT job_id, result_json
        FROM shortbox.admin_task_result
        WHERE task_identifier IN (:taskNames)
        `,
        {
          replacements: { taskNames },
          type: QueryTypes.SELECT,
        },
      )) as Array<{ job_id: string; result_json: string }>;

      let finalizedPendingCount = 0;

      for (const row of resultRows) {
        const jobId = String(row.job_id || '');
        if (!jobId || remainingJobIds.has(jobId)) continue;

        try {
          const parsed = JSON.parse(row.result_json || '{}') as {
            status?: string;
            dryRun?: boolean;
            summary?: string;
            details?: unknown;
          };
          const summary = String(parsed.summary || '').toLowerCase();
          const detailsState =
            parsed.details && typeof parsed.details === 'object'
              ? String((parsed.details as { state?: unknown }).state || '').toLowerCase()
              : '';
          const isPendingState =
            summary.includes('queued') ||
            summary.includes('running') ||
            summary.includes('waiting for retry') ||
            detailsState === 'queued' ||
            detailsState === 'running' ||
            detailsState === 'failed-awaiting-retry';

          if (!isPendingState) continue;

          await models.sequelize.query(
            `
            UPDATE shortbox.admin_task_result
            SET result_json = :resultJson, created_at = NOW()
            WHERE job_id = :jobId
            `,
            {
              replacements: {
                jobId,
                resultJson: JSON.stringify({
                  status: 'FAILED',
                  dryRun: Boolean(parsed.dryRun),
                  summary: 'Job manually removed from queue',
                  details: {
                    state: 'cancelled',
                    previousSummary: parsed.summary || null,
                  },
                }),
              },
              type: QueryTypes.UPDATE,
            },
          );
          finalizedPendingCount += 1;
        } catch {
          // ignore malformed historic rows
        }
      }

      return removedCount + finalizedPendingCount;
    },
  },
  AdminTask: {
    lastRun: (parent: { lastRun?: unknown }) => parent.lastRun || null,
    runs: (parent: { runs?: unknown[] }, args: { limit?: number }) => {
      const currentRuns = Array.isArray(parent.runs) ? parent.runs : [];
      const limit = Number(args.limit || 0);
      if (!Number.isFinite(limit) || limit <= 0) return currentRuns;
      return currentRuns.slice(0, Math.min(Math.trunc(limit), 50));
    },
  },
};
