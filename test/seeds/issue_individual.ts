import {asyncForEach} from '../../src/util/util';
import {knex_test} from '../database';

export const tableName = 'issue_individual';
export const ISSUE_INDIVIDUAL = [
  {
    fk_issue: 1,
    fk_individual: 1,
    type: 'WRITER',
  },
  {
    fk_issue: 2,
    fk_individual: 1,
    type: 'PENCILER',
  },
  {
    fk_issue: 3,
    fk_individual: 2,
    type: 'WRITER',
  },
  {
    fk_issue: 4,
    fk_individual: 3,
    type: 'WRITER',
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(ISSUE_INDIVIDUAL, async (issue_individual: any) => {
    await knex_test(tableName).insert(issue_individual);
  });
}
