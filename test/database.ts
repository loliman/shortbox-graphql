import Knex = require('knex');

export const knex_test = Knex({
  client: 'mysql2',
  connection: {
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'shortbox_test',
  },
});
