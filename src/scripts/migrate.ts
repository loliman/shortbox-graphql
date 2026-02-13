import sequelize from '../core/database';
import {
  getMigrationStatus,
  rollbackLastMigration,
  runPendingMigrations,
} from '../core/migrations';
import logger from '../util/logger';

const command = (process.argv[2] || 'up').toLowerCase();

async function run() {
  await sequelize.authenticate();

  if (command === 'up') {
    await runPendingMigrations(sequelize);
    logger.info('Migration command completed: up');
    return;
  }

  if (command === 'down') {
    const rolledBack = await rollbackLastMigration(sequelize);
    if (!rolledBack) logger.info('No migration available to roll back.');
    logger.info('Migration command completed: down');
    return;
  }

  if (command === 'status') {
    const status = await getMigrationStatus(sequelize);
    if (status.length === 0) {
      logger.info('No migration files found.');
      return;
    }

    status.forEach((entry) => {
      const appliedAtText = entry.appliedAt ? ` at ${entry.appliedAt.toISOString()}` : '';
      logger.info(`[${entry.applied ? 'X' : ' '}] ${entry.id}${appliedAtText}`);
    });
    return;
  }

  throw new Error(`Unknown migration command "${command}". Supported: up | down | status`);
}

run()
  .catch((error) => {
    if (error instanceof Error) {
      logger.error(`Migration command failed: ${error.message || error.name}`, {
        stack: error.stack,
      });
      process.exitCode = 1;
      return;
    }
    logger.error(`Migration command failed: ${String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
