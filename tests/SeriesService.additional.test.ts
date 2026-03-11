import { SeriesService } from '../src/services/SeriesService';
import logger from '../src/util/logger';
import { Op } from 'sequelize';

jest.mock('../src/util/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('SeriesService additional coverage', () => {
  let service: SeriesService;
  let mockModels: any;

  beforeEach(() => {
    mockModels = {
      Series: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
      },
      Publisher: {
        findOne: jest.fn(),
      },
      Issue: {
        findAll: jest.fn(),
      },
      Story: {},
      Appearance: {},
      Individual: {},
      Arc: {},
      Cover: {},
    };
    service = new SeriesService(mockModels, 'req-2');
    jest.clearAllMocks();
  });

  it('routes private log messages by level', () => {
    (service as any).log('info');
    (service as any).log('warn', 'warn');
    (service as any).log('error', 'error');

    expect((logger.info as jest.Mock).mock.calls[0][0]).toBe('info');
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe('warn');
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe('error');
  });

  it('adds publisher and pattern constraints on non-filter search', async () => {
    mockModels.Series.findAll.mockResolvedValue([{ id: 1, title: 'Alpha', volume: 1 }]);

    const result = await service.findSeries(
      'Spider Man',
      { name: 'Marvel', us: true } as any,
      5,
      Buffer.from('9').toString('base64'),
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    const options = mockModels.Series.findAll.mock.calls[0][0];
    expect(options.where['$publisher.name$']).toBe('Marvel');
    expect(options.where['$publisher.original$']).toBe(true);
    expect(options.where.title[Symbol.for('iLike') as any] || options.where.title).toBeTruthy();
  });

  it('treats missing or blank publisher name like wildcard for series search', async () => {
    mockModels.Series.findAll.mockResolvedValue([{ id: 1, title: 'Alpha', volume: 1 }]);

    await service.findSeries('', { name: '   ', us: true } as any, 5, undefined, false, undefined);

    const options = mockModels.Series.findAll.mock.calls[0][0];
    expect(options.where['$publisher.name$']).toBeUndefined();
    expect(options.where['$publisher.original$']).toBe(true);
  });

  it('retries wildcard search without us filter when first query is empty', async () => {
    mockModels.Series.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2, title: 'Beta', volume: 1 }]);

    const result = await service.findSeries(
      '',
      { name: '*', us: true } as any,
      5,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    expect(mockModels.Series.findAll).toHaveBeenCalledTimes(2);
    expect(mockModels.Series.findAll.mock.calls[0][0].where['$publisher.original$']).toBe(true);
    expect(
      mockModels.Series.findAll.mock.calls[1][0].where['$publisher.original$'],
    ).toBeUndefined();
  });

  it('does not apply publisher filters when wildcard has no us constraint', async () => {
    mockModels.Series.findAll.mockResolvedValue([{ id: 3, title: 'Gamma', volume: 2 }]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      5,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    const options = mockModels.Series.findAll.mock.calls[0][0];
    expect(options.where['$publisher.name$']).toBeUndefined();
    expect(options.where['$publisher.original$']).toBeUndefined();
    expect(mockModels.Series.findAll).toHaveBeenCalledTimes(1);
  });

  it('does not retry fallback when pattern is present', async () => {
    mockModels.Series.findAll.mockResolvedValue([]);

    const result = await service.findSeries(
      'spider',
      { name: '*', us: true } as any,
      5,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(0);
    expect(mockModels.Series.findAll).toHaveBeenCalledTimes(1);
  });

  it('uses non-filter defaults when first/name are missing and us is false', async () => {
    mockModels.Series.findAll.mockResolvedValue([{ id: 11, title: 'Omega', volume: 1 }]);

    const result = await service.findSeries(
      undefined,
      { us: false } as any,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    const options = mockModels.Series.findAll.mock.calls[0][0];
    expect(options.where['$publisher.name$']).toBeUndefined();
    expect(options.where['$publisher.original$']).toBe(false);
  });

  it('sorts non-filter results while ignoring leading articles', async () => {
    mockModels.Series.findAll.mockResolvedValue([
      { id: 3, title: 'The Amazing Spider-Man', volume: 1 },
      { id: 2, title: 'Batman', volume: 1 },
      { id: 1, title: 'Die Spinne', volume: 1 },
      { id: 4, title: 'Amazing Spider-Man', volume: 2 },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.map((edge) => edge.node.title)).toEqual([
      'The Amazing Spider-Man',
      'Amazing Spider-Man',
      'Batman',
      'Die Spinne',
    ]);
  });

  it('uses filter-based lookup path and maps issue series nodes', async () => {
    mockModels.Issue.findAll.mockResolvedValue([
      {
        series: {
          id: 5,
          title: 'X-Men',
          volume: 2,
          startyear: 1991,
          endyear: 2001,
          fk_publisher: 9,
        },
      },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      3,
      Buffer.from('4').toString('base64'),
      true,
      { us: true, and: true } as any,
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.node).toMatchObject({ id: 5, title: 'X-Men', volume: 2 });

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.group).toBeUndefined();
    expect(options.attributes).toEqual(['id', 'fk_series']);
    expect(options.where['$series.publisher.name$']).toBeUndefined();
    expect(options.where['$series.publisher.original$']).toBeUndefined();
  });

  it('sorts filter-based results while ignoring leading articles', async () => {
    mockModels.Issue.findAll.mockResolvedValue([
      {
        series: {
          id: 3,
          title: 'The Amazing Spider-Man',
          volume: 1,
          startyear: 1963,
          endyear: 0,
          genre: '',
          fk_publisher: 1,
        },
      },
      {
        series: {
          id: 2,
          title: 'Batman',
          volume: 1,
          startyear: 1940,
          endyear: 0,
          genre: '',
          fk_publisher: 1,
        },
      },
      {
        series: {
          id: 1,
          title: 'Die Spinne',
          volume: 1,
          startyear: 1974,
          endyear: 0,
          genre: '',
          fk_publisher: 2,
        },
      },
      {
        series: {
          id: 4,
          title: 'Amazing Spider-Man',
          volume: 2,
          startyear: 1999,
          endyear: 0,
          genre: '',
          fk_publisher: 1,
        },
      },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      undefined,
      undefined,
      true,
      { us: true, and: true } as any,
    );

    expect(result.edges.map((edge) => edge.node.title)).toEqual([
      'The Amazing Spider-Man',
      'Amazing Spider-Man',
      'Batman',
      'Die Spinne',
    ]);
  });

  it('sorts umlauts like their base letters', async () => {
    mockModels.Series.findAll.mockResolvedValue([
      { id: 3, title: 'Oz', volume: 1 },
      { id: 1, title: 'Ärger', volume: 1 },
      { id: 4, title: 'Uber', volume: 1 },
      { id: 2, title: 'Apfel', volume: 1 },
      { id: 5, title: 'Überfall', volume: 1 },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.map((edge) => edge.node.title)).toEqual([
      'Apfel',
      'Ärger',
      'Oz',
      'Uber',
      'Überfall',
    ]);
  });

  it('ignores punctuation in series sort keys', async () => {
    mockModels.Series.findAll.mockResolvedValue([
      { id: 3, title: 'Spider-Man', volume: 1 },
      { id: 4, title: 'Spider Man', volume: 2 },
      { id: 2, title: 'Spider: Man', volume: 1 },
      { id: 1, title: "Spider-Man!", volume: 1 },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.map((edge) => `${edge.node.title}|${edge.node.volume}`)).toEqual([
      'Spider-Man!|1',
      'Spider: Man|1',
      'Spider-Man|1',
      'Spider Man|2',
    ]);
  });

  it('treats hyphens as word separators for sorting', async () => {
    mockModels.Series.findAll.mockResolvedValue([
      { id: 2, title: 'Marvel Comic Sonderausgabe', volume: 1 },
      { id: 1, title: 'Marvel Comic-Hits', volume: 1 },
    ]);

    const result = await service.findSeries(
      undefined,
      { name: '*' } as any,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.map((edge) => edge.node.title)).toEqual([
      'Marvel Comic-Hits',
      'Marvel Comic Sonderausgabe',
    ]);
  });

  it('returns unique, trimmed genres with stable sorting and cursor/limit support', async () => {
    mockModels.Series.findAll.mockResolvedValue([
      { genre: ' Superhero , Sci-Fi ' },
      { genre: 'superhero' },
      { genre: 'Action, Sci-Fi' },
      { genre: '' },
      { genre: null },
      { genre: 'Fantasy' },
    ]);

    const allGenres = await service.findGenres(undefined, undefined, undefined);
    const pagedGenres = await service.findGenres(undefined, 2, 'sci-fi');
    const filteredGenres = await service.findGenres('hero', undefined, undefined);

    expect(allGenres).toEqual(['Action', 'Fantasy', 'Sci-Fi', 'Superhero']);
    expect(pagedGenres).toEqual(['Superhero']);
    expect(filteredGenres).toEqual(['Superhero']);
  });

  it('applies pattern filter when querying genres', async () => {
    mockModels.Series.findAll.mockResolvedValue([]);

    await service.findGenres('science fiction', undefined, undefined);

    const options = mockModels.Series.findAll.mock.calls[0][0];
    expect(options.where.genre[Op.iLike]).toBe('%science%fiction%');
  });

  it('keeps publisher context in filter-based series lookup when publisher is specific', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);

    await service.findSeries(undefined, { name: 'Marvel', us: true } as any, 3, undefined, true, {
      us: true,
      and: true,
    } as any);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.where['$series.publisher.name$']).toBe('Marvel');
    expect(options.where['$series.publisher.original$']).toBe(true);
  });

  it('throws on delete when publisher is missing', async () => {
    mockModels.Publisher.findOne.mockResolvedValue(null);

    await expect(service.deleteSeries({ title: 'X', volume: 1 } as any, {} as any)).rejects.toThrow(
      'Publisher not found',
    );
  });

  it('throws on delete when series is missing', async () => {
    mockModels.Publisher.findOne.mockResolvedValue({ id: 10 });
    mockModels.Series.findOne.mockResolvedValue(null);

    await expect(
      service.deleteSeries({ title: 'X', volume: 1, publisher: { name: 'M' } } as any, {} as any),
    ).rejects.toThrow('Series not found');
  });

  it('deletes an existing series', async () => {
    const deleteInstance = jest.fn().mockResolvedValue('deleted-series');
    mockModels.Publisher.findOne.mockResolvedValue({ id: 10 });
    mockModels.Series.findOne.mockResolvedValue({ deleteInstance });

    const result = await service.deleteSeries(
      { title: 'X-Men', volume: 1, publisher: { name: 'Marvel' } } as any,
      {} as any,
    );

    expect(deleteInstance).toHaveBeenCalled();
    expect(result).toBe('deleted-series');
  });

  it('deletes series with empty title fallback', async () => {
    const deleteInstance = jest.fn().mockResolvedValue('deleted-empty');
    mockModels.Publisher.findOne.mockResolvedValue({ id: 10 });
    mockModels.Series.findOne.mockResolvedValue({ deleteInstance });

    const result = await service.deleteSeries(
      { volume: 1, publisher: { name: '' } } as any,
      {} as any,
    );

    expect(result).toBe('deleted-empty');
    expect(mockModels.Series.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ title: '', volume: 1, fk_publisher: 10 }),
      }),
    );
  });

  it('throws on create when publisher is missing', async () => {
    mockModels.Publisher.findOne.mockResolvedValue(null);

    await expect(
      service.createSeries(
        { title: 'Y', volume: 1, publisher: { name: 'Unknown' } } as any,
        {} as any,
      ),
    ).rejects.toThrow('Publisher not found');
  });

  it('creates series with fallback values when title/publisher name are missing', async () => {
    mockModels.Publisher.findOne.mockResolvedValue({ id: 6 });
    mockModels.Series.create.mockResolvedValue({ id: 44 });

    await service.createSeries({ publisher: {} as any, volume: 1 } as any, {} as any);

    expect(mockModels.Publisher.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: '' },
      }),
    );
    expect(mockModels.Series.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        genre: '',
        fk_publisher: 6,
      }),
      expect.anything(),
    );
  });

  it('throws on edit when publisher or series is missing', async () => {
    mockModels.Publisher.findOne.mockResolvedValueOnce(null);
    await expect(
      service.editSeries(
        { title: 'A', publisher: { name: 'P' } } as any,
        { title: 'B' } as any,
        {} as any,
      ),
    ).rejects.toThrow('Publisher not found');

    mockModels.Publisher.findOne.mockResolvedValueOnce({ id: 1 });
    mockModels.Series.findOne.mockResolvedValueOnce(null);
    await expect(
      service.editSeries(
        { title: 'A', volume: 1, publisher: { name: 'P' } } as any,
        { title: 'B', volume: 2, startyear: 2000 } as any,
        {} as any,
      ),
    ).rejects.toThrow('Series not found');
  });

  it('edits series and maps getSeriesByIds order', async () => {
    const save = jest.fn().mockResolvedValue('saved-series');
    const existing = {
      id: 4,
      title: 'Old Title',
      volume: 1,
      startyear: 1900,
      endyear: 1901,
      genre: '',
      addinfo: '',
      save,
    };

    mockModels.Publisher.findOne.mockResolvedValue({ id: 5 });
    mockModels.Series.findOne.mockResolvedValue(existing);
    mockModels.Series.findAll.mockResolvedValue([
      { id: 7, title: 'B' },
      { id: 6, title: 'A' },
    ]);

    const editResult = await service.editSeries(
      { title: 'Old Title', volume: 1, publisher: { name: 'Marvel' } } as any,
      { title: ' New ', volume: 2, startyear: 2001, endyear: 2005, genre: 'Action', addinfo: 'note' } as any,
      {} as any,
    );
    const mapped = await service.getSeriesByIds([6, 8, 7]);

    expect(editResult).toBe('saved-series');
    expect(existing.title).toBe('New');
    expect(existing.volume).toBe(2);
    expect(existing.startyear).toBe(2001);
    expect(existing.endyear).toBe(2005);
    expect(existing.genre).toBe('Action');
    expect(existing.addinfo).toBe('note');
    expect(mapped).toEqual([{ id: 6, title: 'A' }, null, { id: 7, title: 'B' }]);
  });

  it('applies edit fallbacks when old/item fields are missing', async () => {
    const save = jest.fn().mockResolvedValue('saved-fallbacks');
    const existing = {
      id: 8,
      title: 'Initial',
      volume: 9,
      startyear: 1999,
      endyear: 2000,
      genre: 'Legacy',
      addinfo: 'x',
      save,
    };

    mockModels.Publisher.findOne.mockResolvedValue({ id: 7 });
    mockModels.Series.findOne.mockResolvedValue(existing);

    const result = await service.editSeries({ volume: 1 } as any, {} as any, {} as any);

    expect(result).toBe('saved-fallbacks');
    expect(mockModels.Publisher.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { name: '' },
      }),
    );
    expect(mockModels.Series.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ title: '', volume: 1, fk_publisher: 7 }),
      }),
    );
    expect(existing.title).toBe('');
    expect(existing.volume).toBe(0);
    expect(existing.startyear).toBe(0);
    expect(existing.endyear).toBe(0);
    expect(existing.genre).toBe('');
    expect(existing.addinfo).toBe('');
  });
});
