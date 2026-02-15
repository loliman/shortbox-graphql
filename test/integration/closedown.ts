import {knex_test} from '../database';
import {asyncForEach} from '../../src/util/util';
import {TABLES} from './setup';

export async function closedown(): Promise<any> {
  await knex_test.raw('SET foreign_key_checks = 0;');

  await asyncForEach(TABLES, async (table: string) => {
    await knex_test(table).truncate();
  });

  await knex_test.destroy();
  return true;
}
