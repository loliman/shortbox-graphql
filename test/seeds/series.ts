import {asyncForEach} from '../../src/util/util';
import {Series} from '../../src/database/Series';
import {PUBLISHERS} from './publisher';

export const SERIES = [
  {
    id: 1,
    title: 'Amazing Spider-Man',
    volume: 1,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 2,
    title: 'Avengers',
    volume: 1,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 3,
    title: 'Iron Man',
    volume: 1,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 4,
    title: 'Spider-Man',
    volume: 2,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 5,
    title: 'Spider-Man',
    volume: 3,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 6,
    title: 'Spider-Man again',
    volume: 3,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
  {
    id: 7,
    title: 'Winter Spider-Man StoryDto',
    volume: 3,
    addinfo: 'Keine Informationen verfügbar.',
    startyear: 1961,
    endyear: 0,
    fk_publisher: PUBLISHERS[0].id,
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(SERIES, async (series: Series) => {
    await Series.query().insert(series);
  });
}
