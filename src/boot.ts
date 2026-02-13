import sequelize from './core/database';
import fs from 'fs';
import { coverDir, wwwDir } from './config/config';
import { cleanup } from './core/cleanup';
import shell from 'shelljs';
import logger from './util/logger';
import { runPendingMigrations } from './core/migrations';

export async function boot(process: () => Promise<void>) {
  await sequelize.authenticate();
  logger.info('🚀 Database is up and running');

  logger.info('🚀 Applying database migrations...');
  await runPendingMigrations(sequelize);
  logger.info('🚀 Database migrations applied');

  logger.info('🚀 Database is all set up');

  logger.info('🚀 Creating cover directory...');

  if (!fs.existsSync(wwwDir + '/' + coverDir)) shell.mkdir('-p', wwwDir + '/' + coverDir);

  logger.info('🚀 ... Done!');

  logger.info(`🚀 Coverdir is set up at ${wwwDir}/${coverDir}`);

  logger.info('🚀 Starting cleanup process...');

  cleanup.start();

  logger.info('🚀 ... Done!');

  await process();

  logger.info('🚀 All done, lets go!');
}
