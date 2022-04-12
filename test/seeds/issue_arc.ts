import {asyncForEach} from '../../src/util/util';
import {knex_test} from '../database';

export const tableName = 'issue_arc';
export const ISSUE_ARC = [
  {
    fk_issue: 1,
    fk_arc: 1,
  },
  {
    fk_issue: 2,
    fk_arc: 1,
  },
  {
    fk_issue: 3,
    fk_arc: 2,
  },
  {
    fk_issue: 4,
    fk_arc: 3,
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(ISSUE_ARC, async (issue_arc: any) => {
    await knex_test(tableName).insert(issue_arc);
  });
}
