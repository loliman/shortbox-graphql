import sequelize from './core/database';
import { cleanup } from './core/cleanup';
import logger from './util/logger';
import { migrator } from './core/migrations';
import models from './models';

const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
const isProduction = nodeEnv === 'production';
const bootstrapSchemaEnabled = (process.env.DB_BOOTSTRAP_SYNC || 'true').toLowerCase() === 'true';

export async function boot(process: () => Promise<void>) {
  await sequelize.authenticate();
  logger.info('🚀 Database is up and running');

  if (!isProduction && bootstrapSchemaEnabled) {
    logger.info('🚀 Bootstrapping schema from Sequelize models (non-production only)...');
    await models.sequelize.sync();
    logger.info('🚀 Sequelize model bootstrap complete');
  }

  logger.info('🚀 Applying database migrations...');
  const appliedMigrations = await migrator.up();
  if (appliedMigrations.length === 0) {
    logger.info('🚀 Database schema is up to date');
  } else {
    appliedMigrations.forEach((migration) => {
      logger.info(`🚀 Applied migration ${migration.name}`);
    });
  }
  logger.info('🚀 Database migrations applied');

  logger.info('🚀 Database is all set up');

  logger.info('🚀 Starting cleanup process...');

  cleanup.start();

  logger.info('🚀 ... Done!');

  await process();

  logger.info('🚀 All done, lets go!');
}
