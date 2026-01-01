import { startServer } from './core/server';
import { boot } from './boot';
import logger from './util/logger';

boot(async () => {
  const { url } = await startServer();
  logger.info(`🚀 Server is up and running at ${url}`);
});
