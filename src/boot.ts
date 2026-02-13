import sequelize from './core/database';
import { cleanup } from './core/cleanup';
import logger from './util/logger';
import { runPendingMigrations } from './core/migrations';

export async function boot(process: () => Promise<void>) {
  await sequelize.authenticate();
  logger.info('🚀 Database is up and running');

  logger.info('🚀 Applying database migrations...');
  await runPendingMigrations(sequelize);
  logger.info('🚀 Database migrations applied');

  logger.info('🚀 Database is all set up');

  logger.info('🚀 Starting cleanup process...');

  cleanup.start();

  logger.info('🚀 ... Done!');

  await process();

  logger.info('🚀 All done, lets go!');
}
