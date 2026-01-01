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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findSeries', () => {
    it('should call models.Series.findAll when no filter is provided', async () => {
      (models.Series.findAll as jest.Mock).mockResolvedValue([{ title: 'Spider-Man' }]);
      
      const result = await SeriesService.findSeries('', { name: '*' }, 0, 50, false, null);
      
      expect(models.Series.findAll).toHaveBeenCalled();
      expect(result).toEqual([{ title: 'Spider-Man' }]);
    });
  });

  describe('createSeries', () => {
    it('should find publisher and create series', async () => {
      const mockPub = { id: 1, name: 'Marvel' };
      const mockSeries = { title: 'X-Men', volume: 1 };
      const mockTransaction = {} as any;

      (models.Publisher.findOne as jest.Mock).mockResolvedValue(mockPub);
      (models.Series.create as jest.Mock).mockResolvedValue(mockSeries);

      const result = await SeriesService.createSeries({
        title: 'X-Men',
        volume: 1,
        publisher: { name: 'Marvel' }
      }, mockTransaction);

      expect(models.Publisher.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { name: 'Marvel' }
      }));
      expect(models.Series.create).toHaveBeenCalled();
      expect(result).toEqual(mockSeries);
    });
  });
});
