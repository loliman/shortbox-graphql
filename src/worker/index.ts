import { run, Runner } from 'graphile-worker';
import logger from '../util/logger';
import { loadTaskList } from './task-loader';
import { getWorkerUtils } from '../lib/workerUtils';

const resolveConnectionString = (): string => {
  const direct = process.env.DATABASE_URL;
  if (direct) return direct;

  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '5432';
  const database = process.env.DB_NAME || 'shortbox';
  const user = encodeURIComponent(process.env.DB_USER || 'shortbox');
  const password = encodeURIComponent(process.env.DB_PASSWORD || 'shortbox');

  return `postgres://${user}:${password}@${host}:${port}/${database}`;
};

let runner: Runner | null = null;

export const startWorker = async (): Promise<void> => {
  if (runner) return;

  const workerUtils = await getWorkerUtils();
  await workerUtils.migrate();

  runner = await run({
    connectionString: resolveConnectionString(),
    concurrency: 5,
    taskList: loadTaskList(),
  });

  logger.info('🚀 Graphile worker started');
};

export const stopWorker = async (): Promise<void> => {
  if (!runner) return;
  await runner.stop();
  runner = null;
  logger.info('🚀 Graphile worker stopped');
};
