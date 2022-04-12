import {Config} from '../config/config';
import Knex = require('knex');

export const knex = Knex({
  client: 'mysql2',
  connection: {
    host: '127.0.0.1',
    user: Config.DB_USER,
    password: Config.DB_PASSWORD,
    database: Config.DB_NAME,
  },
  //debug: true,
});
