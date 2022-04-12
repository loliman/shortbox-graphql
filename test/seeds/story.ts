import {asyncForEach} from '../../src/util/util';
import {Story} from '../../src/database/Story';

export const STORIES = [];

export async function seed(): Promise<void> {
  await asyncForEach(STORIES, async (story: Story) => {
    await Story.query().insert(story);
  });
}
