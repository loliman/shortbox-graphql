import { PublisherService } from '../src/services/PublisherService';
import logger from '../src/util/logger';

jest.mock('../src/util/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PublisherService additional coverage', () => {
  let service: PublisherService;
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
      Story: {},
      Appearance: {},
      Individual: {},
      Arc: {},
      Cover: {},
    };
    service = new PublisherService(mockModels, 'req-1');
    jest.clearAllMocks();
  });

  it('routes private log messages to warn/error/info', () => {
    (service as any).log('info');
    (service as any).log('warn', 'warn');
    (service as any).log('error', 'error');

    expect((logger.info as jest.Mock).mock.calls[0][0]).toBe('info');
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe('warn');
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe('error');
  });

  it('ignores cursor pagination for non-filter publisher search', async () => {
    mockModels.Publisher.findAll.mockResolvedValue([]);

    await service.findPublishers(
      undefined,
      true,
      10,
      Buffer.from('5').toString('base64'),
      false,
      undefined,
    );

    const options = mockModels.Publisher.findAll.mock.calls[0][0];
    const andSymbol = Object.getOwnPropertySymbols(options.where).find((s) => String(s).includes('and'));
    expect(andSymbol).toBeUndefined();
  });

  it('uses filter-based lookup path and maps issue publishers', async () => {
    mockModels.Issue.findAll.mockResolvedValue([
      { Series: { Publisher: { id: 11, name: 'Marvel' } } },
      { Series: { Publisher: { id: 12, name: 'DC' } } },
    ]);

    const result = await service.findPublishers(
      undefined,
      false,
      2,
      Buffer.from('3').toString('base64'),
      true,
      { us: true, and: true } as any,
    );

    expect(result.edges).toHaveLength(2);
    expect(result.edges.map((edge: any) => edge.node.name)).toEqual(['DC', 'Marvel']);
    expect(result.edges.map((edge: any) => edge.node.id)).toEqual([12, 11]);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.group).toBeUndefined();
    expect(options.attributes).toEqual(['id']);
  });

  it('throws when deleting unknown publisher', async () => {
    mockModels.Publisher.findOne.mockResolvedValue(null);

    await expect(
      service.deletePublisher({ name: 'Unknown' } as any, {} as any),
    ).rejects.toThrow('Publisher not found');
  });

  it('deletes publisher and child series', async () => {
    const pubDestroy = jest.fn().mockResolvedValue('deleted-publisher');
    const seriesDeleteA = jest.fn().mockResolvedValue(undefined);
    const seriesDeleteB = jest.fn().mockResolvedValue(undefined);

    mockModels.Publisher.findOne.mockResolvedValue({ id: 7, destroy: pubDestroy });
    mockModels.Series.findAll.mockResolvedValue([
      { deleteInstance: seriesDeleteA },
      { deleteInstance: seriesDeleteB },
    ]);

    const result = await service.deletePublisher({ name: 'Marvel' } as any, {} as any);

    expect(seriesDeleteA).toHaveBeenCalled();
    expect(seriesDeleteB).toHaveBeenCalled();
    expect(pubDestroy).toHaveBeenCalled();
    expect(result).toBe('deleted-publisher');
  });

  it('throws when editing unknown publisher', async () => {
    mockModels.Publisher.findOne.mockResolvedValue(null);

    await expect(
      service.editPublisher({ name: 'A' } as any, { name: 'B' } as any, {} as any),
    ).rejects.toThrow('Publisher not found');
  });

  it('edits and saves publisher', async () => {
    const save = jest.fn().mockResolvedValue('saved');
    const existing = {
      name: 'Old',
      addinfo: '',
      startyear: 0,
      endyear: 0,
      save,
    };
    mockModels.Publisher.findOne.mockResolvedValue(existing);

    const result = await service.editPublisher(
      { name: 'Old' } as any,
      { name: '  New Name ', addinfo: 'note', startyear: 1990, endyear: 2000 } as any,
      {} as any,
    );

    expect(existing.name).toBe('New Name');
    expect(existing.addinfo).toBe('note');
    expect(existing.startyear).toBe(1990);
    expect(existing.endyear).toBe(2000);
    expect(save).toHaveBeenCalled();
    expect(result).toBe('saved');
  });

  it('maps getPublishersByIds results back to request order', async () => {
    mockModels.Publisher.findAll.mockResolvedValue([
      { id: 2, name: 'DC' },
      { id: 1, name: 'Marvel' },
    ]);

    const result = await service.getPublishersByIds([1, 3, 2]);
    expect(result).toEqual([
      { id: 1, name: 'Marvel' },
      null,
      { id: 2, name: 'DC' },
    ]);
  });
});
