import { SeriesService } from '../src/services/SeriesService';
import models from '../src/models';

jest.mock('../src/models', () => ({
  Series: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  },
  Publisher: {
    findOne: jest.fn(),
  },
  sequelize: {
    query: jest.fn(),
  },
}));

describe('SeriesService', () => {
  const service = new SeriesService(models as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findSeries', () => {
    it('should call models.Series.findAll when no filter is provided', async () => {
      (models.Series.findAll as jest.Mock).mockResolvedValue([
        { id: 1, title: 'Spider-Man', volume: 1 },
      ]);

      const result = await service.findSeries('', { name: '*' } as any, 50, undefined, false, undefined);

      expect(models.Series.findAll).toHaveBeenCalled();
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]?.node).toMatchObject({ title: 'Spider-Man', volume: 1 });
      expect(result.pageInfo.hasNextPage).toBe(false);
    });
  });

  describe('createSeries', () => {
    it('should find publisher and create series', async () => {
      const mockPub = { id: 1, name: 'Marvel' };
      const mockSeries = { title: 'X-Men', volume: 1 };
      const mockTransaction = {} as any;

      (models.Publisher.findOne as jest.Mock).mockResolvedValue(mockPub);
      (models.Series.create as jest.Mock).mockResolvedValue(mockSeries);

      const result = await service.createSeries({
        title: 'X-Men',
        volume: 1,
        publisher: { name: 'Marvel' },
      }, mockTransaction);

      expect(models.Publisher.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { name: 'Marvel' },
      }));
      expect(models.Series.create).toHaveBeenCalled();
      expect(result).toEqual(mockSeries);
    });
  });
});
