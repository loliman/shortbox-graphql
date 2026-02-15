import {asyncForEach} from '../../src/util/util';
import {Arc} from '../../src/database/Arc';

export const ARCS = [
  {
    id: 1,
    title: 'Civil War',
    type: 'StoryDto Line',
  },
  {
    id: 2,
    title: 'World War Hulk',
    type: 'StoryDto OldArc',
  },
  {
    id: 3,
    title: 'Secret Invasion',
    type: 'Event',
  },
];

export async function seed(): Promise<void> {
  await asyncForEach(ARCS, async (arc: Arc) => {
    await Arc.query().insert(arc);
  });
}
