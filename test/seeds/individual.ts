import {asyncForEach} from '../../src/util/util';
import {Individual} from '../../src/database/Individual';

export const INDIVIDUALS = [
  {
    id: 1,
    name: 'Stan Lee',
  },
  {
    id: 2,
    name: 'Jack Kirby',
  },
  {
    id: 3,
    name: 'Christian Riese',
  },
  {
    id: 4,
    name: 'Sira Osmanoska',
  },
  {
    id: 5,
    name: 'Harry Potter',
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(INDIVIDUALS, async (individual: Individual) => {
    await Individual.query().insert(individual);
  });
}
