import {Model} from 'objection';
import {knex_test} from '../database';
import {createTestClient} from 'apollo-server-testing';
import server from '../../src/core/server';
import {Publisher} from '../../src/database/Publisher';
import {Series} from '../../src/database/Series';
import {asyncForEach} from '../../src/util/util';
import {Issue} from '../../src/database/Issue';
import {Individual} from '../../src/database/Individual';
import {Arc} from '../../src/database/Arc';
import {tableName as issue_arc_tableName} from '../seeds/issue_arc';
import {tableName as issue_individual_tableName} from '../seeds/issue_individual';

export const TABLES = [
  Publisher.tableName,
  Series.tableName,
  Issue.tableName,
  Individual.tableName,
  Arc.tableName,
  issue_arc_tableName,
  issue_individual_tableName,
];

export async function setup(): Promise<any> {
  Model.knex(knex_test);
  await knex_test.migrate.latest();

  await asyncForEach(TABLES, async (table: string) => {
    const seed = require('../seeds/' + table);
    await knex_test.raw('SET foreign_key_checks = 0;');
    await knex_test(table).truncate();
    await seed.seed();
  });

  const {query} = createTestClient(server);
  return query;
}
