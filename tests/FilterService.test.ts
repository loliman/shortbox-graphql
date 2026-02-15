import { GraphQLError } from 'graphql';
import { Op } from 'sequelize';
import { FilterService } from '../src/services/FilterService';
import logger from '../src/util/logger';

jest.mock('../src/util/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const createService = () => {
  const models: any = {
    Issue: { findAll: jest.fn() },
    Series: { modelName: 'Series' },
    Publisher: { modelName: 'Publisher' },
    Story: { modelName: 'Story' },
    Appearance: { modelName: 'Appearance' },
    Individual: { modelName: 'Individual' },
    Arc: { modelName: 'Arc' },
    Cover: { modelName: 'Cover' },
  };
  return { service: new FilterService(models, 'req-test'), models };
};

describe('FilterService', () => {
  it('routes internal log messages by level', () => {
    const { service } = createService();

    (service as any).log('info-message');
    (service as any).log('warn-message', 'warn');
    (service as any).log('error-message', 'error');

    expect((logger.info as jest.Mock).mock.calls[0][0]).toBe('info-message');
    expect((logger.warn as jest.Mock).mock.calls[0][0]).toBe('warn-message');
    expect((logger.error as jest.Mock).mock.calls[0][0]).toBe('error-message');
  });

  it('builds default options with publisher origin filter', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, { us: true } as any);

    expect(options.subQuery).toBe(false);
    expect(options.order).toEqual([]);
    const include = options.include as any[];
    expect(include[0].include[0].where).toEqual({ original: 1 });
  });

  it('builds format, release date, variant and sellable filters', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: false,
      formats: ['HEFT', 'HC'],
      releasedates: [
        { date: '2024-01-01', compare: '>=' },
        { date: '2024-12-31', compare: '<=' },
      ],
      withVariants: true,
      sellable: true,
    } as any);

    const where = options.where as any;
    expect(where.format[Op.in]).toEqual(['HEFT', 'HC']);
    expect(where.format[Op.ne]).toBe('Digital');
    expect(where.releasedate[Op.gte]).toBe('2024-01-01');
    expect(where.releasedate[Op.lte]).toBe('2024-12-31');
    expect(where.variant[Op.ne]).toBe('');
  });

  it('builds all release-date and number comparator branches', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      releasedates: [
        { date: '2024-06-01', compare: '>' },
        { date: '2024-06-30', compare: '<' },
        { date: '2024-06-15', compare: '=' },
      ],
      numbers: [
        null,
        { number: '10', compare: '>', variant: '' },
        { number: '11', compare: '<' },
        { number: '12', compare: '=' },
      ],
    } as any);

    const where = options.where as any;
    expect(where.releasedate[Op.gt]).toBe('2024-06-01');
    expect(where.releasedate[Op.lt]).toBe('2024-06-30');
    expect(where.releasedate[Op.eq]).toBe('2024-06-15');

    const numberConditions = where[Op.or].filter((entry: any) => entry.number);
    expect(numberConditions).toHaveLength(3);
    expect(numberConditions.find((entry: any) => entry.number[Op.gt] === '10')).toBeTruthy();
    expect(numberConditions.find((entry: any) => entry.number[Op.lt] === '11')).toBeTruthy();
    expect(numberConditions.find((entry: any) => entry.number[Op.eq] === '12')).toBeTruthy();
  });

  it('prefers collected filter over withVariants when onlyCollected is enabled', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      withVariants: true,
      onlyCollected: true,
      sellable: true,
    } as any);

    const where = options.where as any;
    expect(where.collected).toBe(true);
    expect(where.variant).toBeUndefined();
    expect(where.format[Op.ne]).toBe('Digital');
  });

  it('builds story conditions and include graph using OR mode', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      appearances: 'Wolverine',
      individuals: [{ name: 'Logan' }],
      firstPrint: true,
    } as any);

    const include = options.include as any[];
    const storyInclude = include.find((item) => item.as === 'Stories');
    expect(storyInclude).toBeTruthy();
    expect(storyInclude.required).toBe(true);
    expect(storyInclude.include).toHaveLength(3);

    const where = options.where as any;
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or]).toHaveLength(3);
  });

  it('builds exclusive/noPrint story conditions and noCover in AND mode', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      and: true,
      exclusive: true,
      noPrint: true,
      noCover: true,
    } as any);

    const where = options.where as any;
    expect(Array.isArray(where[Op.and])).toBe(true);
    expect(
      where[Op.and].some(
        (entry: any) => entry['$Stories.firstapp$'] === true && entry['$Stories.onlyapp$'] === true,
      ),
    ).toBe(true);
    expect(
      where[Op.and].some(
        (entry: any) => entry['$Stories.firstapp$'] === false && entry['$Stories.onlyapp$'] === false,
      ),
    ).toBe(true);
    expect(where[Op.and].some((entry: any) => entry['$Covers.id$'] === null)).toBe(true);
  });

  it('builds AND mode conditions and avoids duplicate Stories include with noContent', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      and: true,
      onlyTb: true,
      noContent: true,
    } as any);

    const include = options.include as any[];
    expect(include.filter((item) => item.as === 'Stories')).toHaveLength(1);

    const where = options.where as any;
    expect(Array.isArray(where[Op.and])).toBe(true);
    expect(where[Op.and]).toHaveLength(2);
  });

  it('adds Stories include when noContent is set without story filters', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      noContent: true,
    } as any);

    const include = options.include as any[];
    expect(include.filter((item) => item.as === 'Stories')).toHaveLength(1);

    const where = options.where as any;
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or].some((entry: any) => entry['$Stories.id$'] === null)).toBe(true);
  });

  it('adds publisher, series and number filters with compare handling', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      publishers: [{ name: 'Marvel' }, { name: 'DC' }],
      series: [{ title: 'X-Men', volume: 1 }],
      numbers: [{ number: '1', compare: '>=', variant: 'A' }],
    } as any);

    const where = options.where as any;
    expect(Array.isArray(where[Op.or])).toBe(true);

    const publisherCondition = where[Op.or].find((entry: any) => entry['$Series.Publisher.name$']);
    expect(publisherCondition['$Series.Publisher.name$'][Op.in]).toEqual(['Marvel', 'DC']);

    const seriesCondition = where[Op.or].find((entry: any) => entry['$Series.title$'] === 'X-Men');
    expect(seriesCondition['$Series.volume$']).toBe(1);

    const numberCondition = where[Op.or].find((entry: any) => entry.number);
    expect(numberCondition.number[Op.gte]).toBe('1');
    expect(numberCondition.variant).toBe('A');
  });

  it('adds arc/noCover filters and export or custom sorting', () => {
    const { service } = createService();
    const exportOptions = service.getFilterOptions(false, { us: false, arcs: 'Clone Saga', noCover: true } as any, true);

    const include = exportOptions.include as any[];
    expect(include.some((item) => item.as === 'Arcs' && item.required)).toBe(true);
    expect(include.some((item) => item.as === 'Covers' && item.required === false)).toBe(true);
    const seriesModel = (include.find((item) => item.model?.modelName === 'Series') || {}).model;
    const publisherModel = (include[0]?.include || []).find(
      (item: any) => item.model?.modelName === 'Publisher',
    )?.model;
    expect(exportOptions.order).toEqual([
      [{ model: seriesModel, as: 'Series' }, { model: publisherModel, as: 'Publisher' }, 'name', 'ASC'],
      [{ model: seriesModel, as: 'Series' }, 'title', 'ASC'],
      [{ model: seriesModel, as: 'Series' }, 'volume', 'ASC'],
      ['number', 'ASC'],
    ]);

    const where = exportOptions.where as any;
    const noCoverCondition = where[Op.or].find((entry: any) => entry['$Covers.id$'] === null);
    expect(noCoverCondition).toBeTruthy();

    const customOrderOptions = service.getFilterOptions(false, { us: true } as any, false, 'updatedAt', 'DESC');
    expect(customOrderOptions.order).toEqual([['updatedAt', 'DESC']]);
  });

  it('exports csv with sorted publishers, series and natural issue order', async () => {
    const { service, models } = createService();
    models.Issue.findAll.mockResolvedValue([
      {
        number: '10',
        format: 'HEFT',
        variant: '',
        pages: 32,
        releasedate: '2020-01-10',
        price: 4.5,
        currency: 'EUR',
        Series: {
          title: 'Alpha',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          Publisher: { name: 'Marvel' },
        },
      },
      {
        number: '2',
        format: 'HEFT',
        variant: '',
        pages: 32,
        releasedate: '2020-01-02',
        price: 4.5,
        currency: 'EUR',
        Series: {
          title: 'Alpha',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          Publisher: { name: 'Marvel' },
        },
      },
      {
        number: '5',
        format: 'HEFT',
        variant: '',
        pages: 40,
        releasedate: '2020-01-05',
        price: 5.0,
        currency: 'EUR',
        Series: {
          title: 'Omega',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          Publisher: { name: 'Marvel' },
        },
      },
      {
        number: '1',
        format: 'HC',
        variant: 'Sketch',
        pages: 48,
        releasedate: '2019-12-01',
        price: 19.99,
        currency: 'USD',
        Series: {
          title: 'Beta',
          volume: 2,
          startyear: 2019,
          endyear: 2021,
          Publisher: { name: 'DC' },
        },
      },
    ]);

    const csvJson = await service.export({ us: true } as any, 'csv', true);
    const csv = JSON.parse(csvJson);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toContain('Verlag;Series;Volume');
    expect(lines[1].startsWith('DC\t;')).toBe(true);
    expect(lines[2]).toContain('\t;2\t;');
    expect(lines[3]).toContain('\t;10\t;');
    expect(lines[4]).toContain('Marvel\t;Omega\t;1');
  });

  it('exports txt including filter summary and result blocks', async () => {
    const { service, models } = createService();
    models.Issue.findAll.mockResolvedValue([
      {
        number: '3',
        format: 'HEFT',
        variant: '',
        pages: 28,
        releasedate: '2024-05-03',
        price: 3.99,
        currency: 'EUR',
        Series: {
          title: 'Gamma',
          volume: 1,
          startyear: 2024,
          endyear: 0,
          Publisher: { name: 'Panini' },
        },
      },
    ]);

    const txtJson = await service.export(
      {
        us: false,
        withVariants: true,
        formats: ['HEFT'],
        releasedates: [{ date: '2024-05-01', compare: '>=' }],
        and: true,
        noCover: true,
        noContent: true,
        onlyNotCollected: true,
        publishers: [{ name: 'Panini' }],
        series: [{ title: 'Gamma', volume: 1 }],
        numbers: [{ number: '3', compare: '>=' }],
        arcs: 'Test Arc',
        individuals: [{ name: 'Peter Parker' }],
        appearances: 'Hero',
      } as any,
      'txt',
      false,
    );

    const txt = JSON.parse(txtJson);
    expect(txt).toContain('Aktive Filter');
    expect(txt).toContain('Deutsche Ausgaben');
    expect(txt).toContain('mit Varianten');
    expect(txt).toContain('Ohne Cover');
    expect(txt).toContain('Ohne Inhalt');
    expect(txt).toContain('Story Arc: Test Arc');
    expect(txt).toContain('Mitwirkende: Peter Parker');
    expect(txt).toContain('Panini');
    expect(txt).toContain('#3');
  });

  it('throws GraphQLError for unknown export type', async () => {
    const { service, models } = createService();
    models.Issue.findAll.mockResolvedValue([]);

    await expect(service.export({ us: true } as any, 'pdf', false)).rejects.toBeInstanceOf(
      GraphQLError,
    );
    await expect(service.export({ us: true } as any, 'pdf', false)).rejects.toMatchObject({
      message: 'Gültige Export Typen: txt, csv',
    });
  });
});
