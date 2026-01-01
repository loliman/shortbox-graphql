import { PublisherService } from '../src/services/PublisherService';

describe('PublisherService', () => {
  let publisherService: PublisherService;
  let mockModels: any;

  beforeEach(() => {
    mockModels = {
      Publisher: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
      },
      Issue: {
        findAll: jest.fn(),
      },
      Series: {
        findAll: jest.fn(),
      },
    };
    publisherService = new PublisherService(mockModels);
  });

  it('should find publishers without filter', async () => {
    const mockPublishers = [{ id: 1, name: 'Marvel' }, { id: 2, name: 'DC' }];
    mockModels.Publisher.findAll.mockResolvedValue(mockPublishers);

    const result = await publisherService.findPublishers(undefined, true, undefined, undefined, false, undefined);

    expect(result.edges.length).toBe(2);
    expect(result.edges[0].node.name).toBe('Marvel');
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(mockModels.Publisher.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { original: true },
      order: [['name', 'ASC'], ['id', 'ASC']]
    }));
  });

  it('should search publishers with pattern', async () => {
    const mockPublishers = [{ id: 1, name: 'Marvel' }];
    mockModels.Publisher.findAll.mockResolvedValue(mockPublishers);

    await publisherService.findPublishers('Marv', true, undefined, undefined, false, undefined);

    expect(mockModels.Publisher.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        name: expect.anything()
      })
    }));
  });

  it('should create a publisher', async () => {
    const input = { name: 'New Pub', us: true, addinfo: 'info', startyear: 2000, endyear: 2024 };
    const mockResult = { id: 1, ...input };
    mockModels.Publisher.create.mockResolvedValue(mockResult);

    const result = await publisherService.createPublisher(input, {} as any);

    expect(result).toEqual(mockResult);
    expect(mockModels.Publisher.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Pub' }),
      expect.objectContaining({ transaction: {} })
    );
  });
});
