import {Publisher} from '../../src/database/Publisher';
import {asyncForEach} from '../../src/util/util';

export const PUBLISHERS = [
  {
    id: 1,
    name: 'BSV',
    us: 0,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1956,
    endyear: 1974,
  },
  {
    id: 2,
    name: 'Condor',
    us: 0,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1973,
    endyear: 0,
  },
  {
    id: 3,
    name: 'Marvel',
    us: 1,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1973,
    endyear: 0,
  },
  {
    id: 4,
    name: 'Panini - Marvel & Icon',
    us: 0,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
  },
  {
    id: 5,
    name: 'Reclam',
    us: 0,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
  },
  {
    id: 6,
    name: 'Williams',
    us: 0,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1970,
    endyear: 1984,
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(PUBLISHERS, async (publisher: Publisher) => {
    await Publisher.query().insert(publisher);
  });
}
