import { startServer } from './core/server';
import { boot } from './boot';
import logger from './util/logger';
import { startWorker, stopWorker } from './worker';
import { releaseWorkerUtils } from './lib/workerUtils';

const mockModeEnabled = (process.env.MOCK_MODE || '').toLowerCase() === 'true';
const workerEnabled = (process.env.WORKER_ENABLED || 'true').toLowerCase() !== 'false';

const registerShutdownHooks = () => {
  const shutdown = async () => {
    await stopWorker();
    await releaseWorkerUtils();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
};

if (mockModeEnabled) {
  startServer().then(({ url }) => {
    logger.info(`🚀 Server is up and running at ${url} (mock mode)`);
  });
} else {
  boot(async () => {
    if (workerEnabled) {
      await startWorker();
      registerShutdownHooks();
    }

    const { url } = await startServer();
    logger.info(`🚀 Server is up and running at ${url}`);
  });
}
