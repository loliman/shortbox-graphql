import { StoryService } from '../src/services/StoryService';

describe('StoryService', () => {
  let storyService: StoryService;
  let mockModels: any;

  beforeEach(() => {
    mockModels = {
      Story: {
        findAll: jest.fn(),
      },
    };
    storyService = new StoryService(mockModels);
  });

  it('batches children by parent ids', async () => {
    mockModels.Story.findAll.mockResolvedValue([
      { id: 1, fk_parent: 10 },
      { id: 2, fk_parent: 10 },
      { id: 3, fk_parent: 11 },
    ]);

    const result = await storyService.getChildrenByParentIds([10, 11, 12]);

    expect(mockModels.Story.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        order: [['id', 'ASC']],
      }),
    );
    expect(result).toHaveLength(3);
    expect(result[0].map((story: any) => story.id)).toEqual([1, 2]);
    expect(result[1].map((story: any) => story.id)).toEqual([3]);
    expect(result[2]).toEqual([]);
  });

  it('batches reprints by story ids', async () => {
    mockModels.Story.findAll.mockResolvedValue([
      { id: 21, fk_reprint: 5 },
      { id: 22, fk_reprint: 5 },
      { id: 23, fk_reprint: 6 },
    ]);

    const result = await storyService.getReprintsByStoryIds([5, 6, 7]);

    expect(mockModels.Story.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.anything(),
        order: [['id', 'ASC']],
      }),
    );
    expect(result).toHaveLength(3);
    expect(result[0].map((story: any) => story.id)).toEqual([21, 22]);
    expect(result[1].map((story: any) => story.id)).toEqual([23]);
    expect(result[2]).toEqual([]);
  });
});
