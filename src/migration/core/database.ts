import Knex from 'knex';
import {Config} from '../../config/config';

export const knexMigration = Knex({
  client: 'mysql',
  connection: {
    host: '127.0.0.1',
    user: Config.MIGRATION_DB_USER,
    password: Config.MIGRATION_DB_PASSWORD,
    database: Config.MIGRATION_DB_NAME,
  },
});
