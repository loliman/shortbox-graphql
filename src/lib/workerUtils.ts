import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';

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

let workerUtilsPromise: Promise<WorkerUtils> | null = null;

export const getWorkerUtils = async (): Promise<WorkerUtils> => {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({
      connectionString: resolveConnectionString(),
    });
  }

  return workerUtilsPromise;
};

export const releaseWorkerUtils = async (): Promise<void> => {
  if (!workerUtilsPromise) return;
  const workerUtils = await workerUtilsPromise;
  await workerUtils.release();
  workerUtilsPromise = null;
};
