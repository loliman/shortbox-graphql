import { startServer } from './core/server';
import { boot } from './boot';
import logger from './util/logger';

const mockModeEnabled = (process.env.MOCK_MODE || '').toLowerCase() === 'true';

if (mockModeEnabled) {
  startServer().then(({ url }) => {
    logger.info(`🚀 Server is up and running at ${url} (mock mode)`);
  });
} else {
  boot(async () => {
    const { url } = await startServer();
    logger.info(`🚀 Server is up and running at ${url}`);
  });
}
