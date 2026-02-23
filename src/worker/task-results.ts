import { JobHelpers } from 'graphile-worker';
import { toStoredDetails } from './task-registry';

const toJsonString = (value: unknown): string =>
  toStoredDetails(JSON.stringify(value, null, 2) || '{}');

export const persistTaskResult = async (
  helpers: JobHelpers,
  taskIdentifier: string,
  result: unknown,
): Promise<void> => {
  await helpers.withPgClient(async (pgClient) => {
    await pgClient.query(
      `
      INSERT INTO shortbox.admin_task_result (job_id, task_identifier, result_json, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (job_id)
      DO UPDATE SET
        task_identifier = EXCLUDED.task_identifier,
        result_json = EXCLUDED.result_json,
        created_at = EXCLUDED.created_at
      `,
      [String(helpers.job.id), taskIdentifier, toJsonString(result)],
    );
  });
};
