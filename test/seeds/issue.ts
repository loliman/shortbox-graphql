import {asyncForEach} from '../../src/util/util';
import {Issue} from '../../src/database/Issue';
import {SERIES} from './series';

export const ISSUES = [
  {
    id: 1,
    title: 'Avengers',
    number: '1',
    format: 'Heft',
    variant: '',
    releasedate: '2020-01-01',
    fk_series: SERIES[1].id,
  },
  {
    id: 2,
    title: 'Iron Man',
    number: '1',
    format: 'Heft',
    variant: '',
    releasedate: '2020-03-01',
    fk_series: SERIES[4].id,
  },
  {
    id: 3,
    title: 'Iron Man',
    number: '2',
    format: 'Heft',
    variant: '',
    releasedate: '2020-02-01',
    fk_series: SERIES[4].id,
  },
  {
    id: 4,
    title: 'Spider-Man',
    number: '1',
    format: 'Heft',
    variant: '',
    releasedate: '2020-02-01',
    fk_series: SERIES[3].id,
  },
  {
    id: 5,
    title: 'Spider-Man',
    number: '1',
    format: 'Heft',
    variant: 'A',
    releasedate: '2020-02-01',
    fk_series: SERIES[3].id,
  },
  {
    id: 6,
    title: 'Spider-Man',
    number: '1',
    format: 'Heft',
    variant: 'B',
    releasedate: '2020-02-01',
    fk_series: SERIES[3].id,
  },
  {
    id: 7,
    title: 'Spider-Man',
    number: '2',
    format: 'Heft',
    variant: '',
    releasedate: '2020-02-01',
    fk_series: SERIES[3].id,
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(ISSUES, async (issue: Issue) => {
    await Issue.query().insert(issue);
  });
}
