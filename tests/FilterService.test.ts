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
    expect(include[0].include[0].where).toEqual({ original: true });
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
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or]).toContainEqual({ format: { [Op.in]: ['HEFT', 'HC'] } });
    expect(where[Op.or]).toContainEqual({ format: { [Op.ne]: 'Digital' } });
    expect(where[Op.or]).toContainEqual({ releasedate: { [Op.gte]: '2024-01-01' } });
    expect(where[Op.or]).toContainEqual({ releasedate: { [Op.lte]: '2024-12-31' } });
    expect(where[Op.or]).toContainEqual({ variant: { [Op.ne]: '' } });
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
    expect(where[Op.or]).toContainEqual({ releasedate: { [Op.gt]: '2024-06-01' } });
    expect(where[Op.or]).toContainEqual({ releasedate: { [Op.lt]: '2024-06-30' } });
    expect(where[Op.or]).toContainEqual({ releasedate: { [Op.eq]: '2024-06-15' } });

    const groupedNumberCondition = where[Op.or].find((entry: any) => Array.isArray(entry[Op.or]));
    expect(groupedNumberCondition).toBeTruthy();
    const numberConditions = groupedNumberCondition[Op.or].filter((entry: any) => entry.number);
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
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or]).toContainEqual({ collected: true });
    expect(where[Op.or].some((entry: any) => entry.variant)).toBe(false);
    expect(where[Op.or]).toContainEqual({ format: { [Op.ne]: 'Digital' } });
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
    const storyInclude = include.find((item) => item.as === 'stories');
    expect(storyInclude).toBeTruthy();
    expect(storyInclude.required).toBe(true);
    expect(storyInclude.include).toHaveLength(3);

    const where = options.where as any;
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or]).toHaveLength(3);
  });

  it('adds only appearance joins when filtering only by appearances', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      appearances: 'Wolverine',
    } as any);

    const include = options.include as any[];
    const storyInclude = include.find((item) => item.as === 'stories');
    expect(storyInclude).toBeTruthy();
    expect(storyInclude.include).toHaveLength(2);
    expect(storyInclude.include.some((item: any) => item.as === 'appearances')).toBe(true);
    expect(storyInclude.include.some((item: any) => item.as === 'individuals')).toBe(false);

    const childrenInclude = storyInclude.include.find((item: any) => item.as === 'children');
    expect(childrenInclude).toBeTruthy();
    expect(childrenInclude.include).toHaveLength(1);
    expect(childrenInclude.include[0].as).toBe('appearances');
  });

  it('adds parent appearance joins for de filters', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: false,
      appearances: 'Spider-Man',
    } as any);

    const include = options.include as any[];
    const storyInclude = include.find((item) => item.as === 'stories');
    expect(storyInclude).toBeTruthy();

    const parentInclude = storyInclude.include.find((item: any) => item.as === 'parent');
    expect(parentInclude).toBeTruthy();
    expect(parentInclude.include.some((item: any) => item.as === 'appearances')).toBe(true);

    const where = options.where as any;
    const appearancesCondition = where[Op.or].find(
      (entry: any) =>
        Array.isArray(entry[Op.or]) &&
        entry[Op.or].some((condition: any) => condition['$stories.parent.appearances.name$']),
    );
    expect(appearancesCondition).toBeTruthy();
  });

  it('adds only individual joins when filtering only by individuals', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      individuals: [{ name: 'Logan' }],
    } as any);

    const include = options.include as any[];
    const storyInclude = include.find((item) => item.as === 'stories');
    expect(storyInclude).toBeTruthy();
    expect(storyInclude.include).toHaveLength(2);
    expect(storyInclude.include.some((item: any) => item.as === 'individuals')).toBe(true);
    expect(storyInclude.include.some((item: any) => item.as === 'appearances')).toBe(false);

    const childrenInclude = storyInclude.include.find((item: any) => item.as === 'children');
    expect(childrenInclude).toBeTruthy();
    expect(childrenInclude.include).toHaveLength(1);
    expect(childrenInclude.include[0].as).toBe('individuals');
  });

  it('maps individual type filters to story individual join conditions', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: false,
      individuals: [{ name: 'Walter Simonson', type: ['WRITER', 'PENCILER'] }],
    } as any);

    const where = options.where as any;
    const individualsCondition = where[Op.or].find((entry: any) =>
      Array.isArray(entry[Op.or])
        ? entry[Op.or].some((condition: any) => condition['$stories.individuals.name$'])
        : false,
    );

    expect(individualsCondition).toBeTruthy();
    expect(individualsCondition[Op.or]).toContainEqual({
      '$stories.individuals.name$': 'Walter Simonson',
      '$stories.individuals.story_individual.type$': { [Op.in]: ['WRITER', 'PENCILER'] },
    });
    expect(individualsCondition[Op.or]).toContainEqual({
      '$stories.children.individuals.name$': 'Walter Simonson',
      '$stories.children.individuals.story_individual.type$': { [Op.in]: ['WRITER', 'PENCILER'] },
    });
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
        (entry: any) => entry['$stories.firstapp$'] === true && entry['$stories.onlyapp$'] === true,
      ),
    ).toBe(true);
    expect(
      where[Op.and].some(
        (entry: any) =>
          entry['$stories.firstapp$'] === false && entry['$stories.onlyapp$'] === false,
      ),
    ).toBe(true);
    expect(where[Op.and].some((entry: any) => entry['$covers.id$'] === null)).toBe(true);
  });

  it('builds AND mode conditions and avoids duplicate stories include with noContent', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      and: true,
      onlyTb: true,
      noContent: true,
    } as any);

    const include = options.include as any[];
    expect(include.filter((item) => item.as === 'stories')).toHaveLength(1);

    const where = options.where as any;
    expect(Array.isArray(where[Op.and])).toBe(true);
    expect(where[Op.and]).toHaveLength(2);
  });

  it('adds stories include when noContent is set without story filters', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      noContent: true,
    } as any);

    const include = options.include as any[];
    expect(include.filter((item) => item.as === 'stories')).toHaveLength(1);

    const where = options.where as any;
    expect(Array.isArray(where[Op.or])).toBe(true);
    expect(where[Op.or].some((entry: any) => entry['$stories.id$'] === null)).toBe(true);
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

    const publisherCondition = where[Op.or].find((entry: any) => entry['$series.publisher.name$']);
    expect(publisherCondition['$series.publisher.name$'][Op.in]).toEqual(['Marvel', 'DC']);

    const groupedConditions = where[Op.or].filter((entry: any) => Array.isArray(entry[Op.or]));
    expect(groupedConditions.length).toBeGreaterThanOrEqual(2);

    const seriesGroup = groupedConditions.find((entry: any) =>
      entry[Op.or].some((item: any) => item['$series.title$'] === 'X-Men'),
    );
    expect(seriesGroup).toBeTruthy();
    expect(seriesGroup[Op.or]).toContainEqual({
      '$series.title$': 'X-Men',
      '$series.volume$': 1,
    });

    const numbersGroup = groupedConditions.find((entry: any) =>
      entry[Op.or].some((item: any) => Boolean(item.number)),
    );
    expect(numbersGroup).toBeTruthy();
    expect(numbersGroup[Op.or]).toContainEqual({
      number: { [Op.gte]: '1' },
      variant: 'A',
    });
  });

  it('adds genre filter conditions for comma-separated series genres', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      genres: ['Sci-Fi', '  Super Hero  ', 'sci-fi'],
    } as any);

    const where = options.where as any;
    const andConditions = where[Op.and];
    expect(Array.isArray(andConditions)).toBe(true);

    const genreCondition = andConditions.find(
      (entry: any) =>
        Array.isArray(entry[Op.or]) &&
        entry[Op.or].every((condition: any) => condition?.logic?.[Op.like]),
    );
    expect(genreCondition).toBeTruthy();

    const likePatterns = genreCondition[Op.or].map((condition: any) => condition.logic[Op.like]);
    expect(likePatterns).toEqual(expect.arrayContaining(['%,sci-fi,%', '%,super hero,%']));
    expect(likePatterns).toHaveLength(2);
  });

  it('adds arc/noCover filters and export or custom sorting', () => {
    const { service } = createService();
    const exportOptions = service.getFilterOptions(
      false,
      { us: false, arcs: 'Clone Saga', noCover: true } as any,
      true,
    );

    const include = exportOptions.include as any[];
    expect(include.some((item) => item.as === 'stories' && item.required)).toBe(true);
    expect(include.some((item) => item.as === 'covers' && item.required === false)).toBe(true);
    const storiesInclude = include.find((item) => item.as === 'stories');
    const parentInclude = storiesInclude?.include?.find((item: any) => item.as === 'parent');
    const issueInclude = parentInclude?.include?.find((item: any) => item.as === 'issue');
    const arcsInclude = issueInclude?.include?.find((item: any) => item.as === 'arcs');
    expect(arcsInclude?.required).toBe(true);
    const seriesModel = (include.find((item) => item.model?.modelName === 'Series') || {}).model;
    const publisherModel = (include[0]?.include || []).find(
      (item: any) => item.model?.modelName === 'Publisher',
    )?.model;
    expect(exportOptions.order).toEqual([
      [
        { model: seriesModel, as: 'series' },
        { model: publisherModel, as: 'publisher' },
        'name',
        'ASC',
      ],
      [{ model: seriesModel, as: 'series' }, 'title', 'ASC'],
      [{ model: seriesModel, as: 'series' }, 'volume', 'ASC'],
      ['number', 'ASC'],
    ]);

    const where = exportOptions.where as any;
    const noCoverCondition = where[Op.or].find((entry: any) => entry['$covers.id$'] === null);
    expect(noCoverCondition).toBeTruthy();

    const customOrderOptions = service.getFilterOptions(
      false,
      { us: true } as any,
      false,
      'updatedat',
      'DESC',
    );
    expect(customOrderOptions.order).toEqual([['updatedat', 'DESC']]);
  });

  it('supports multi-term arc and appearance filters encoded in one string', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: false,
      arcs: 'Civil War || Secret Invasion',
      appearances: 'Venom || Wolverine',
    } as any);

    const include = options.include as any[];
    const storiesInclude = include.find((item) => item.as === 'stories');
    const parentInclude = storiesInclude?.include?.find((item: any) => item.as === 'parent');
    const issueInclude = parentInclude?.include?.find((item: any) => item.as === 'issue');
    const arcsInclude = issueInclude?.include?.find((item: any) => item.as === 'arcs');
    expect(arcsInclude).toBeTruthy();

    const arcOrKey = Object.getOwnPropertySymbols(arcsInclude.where || {}).find((key) =>
      String(key).includes('or'),
    );
    expect(arcOrKey).toBeDefined();
    expect(arcsInclude.where[arcOrKey!]).toEqual([
      { title: { [Op.iLike]: '%Civil War%' } },
      { title: { [Op.iLike]: '%Secret Invasion%' } },
    ]);

    const where = options.where as any;
    const appearancesCondition = where[Op.or].find(
      (entry: any) =>
        Array.isArray(entry[Op.or]) &&
        entry[Op.or].some((condition: any) => condition['$stories.appearances.name$']),
    );
    expect(appearancesCondition).toBeTruthy();
    expect(appearancesCondition[Op.or]).toContainEqual({
      '$stories.appearances.name$': { [Op.iLike]: '%Venom%' },
    });
    expect(appearancesCondition[Op.or]).toContainEqual({
      '$stories.children.appearances.name$': { [Op.iLike]: '%Wolverine%' },
    });
  });

  it('uses direct issue arc joins for us filters', () => {
    const { service } = createService();
    const options = service.getFilterOptions(false, {
      us: true,
      arcs: 'Spider-Verse',
    } as any);

    const include = options.include as any[];
    const directArcsInclude = include.find((item) => item.as === 'arcs');
    expect(directArcsInclude).toBeTruthy();
    expect(directArcsInclude.required).toBe(true);

    const storiesInclude = include.find((item) => item.as === 'stories');
    const parentInclude = storiesInclude?.include?.find((item: any) => item.as === 'parent');
    expect(parentInclude).toBeUndefined();
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
        series: {
          title: 'Alpha',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          publisher: { name: 'Marvel' },
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
        series: {
          title: 'Alpha',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          publisher: { name: 'Marvel' },
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
        series: {
          title: 'Omega',
          volume: 1,
          startyear: 2020,
          endyear: 2020,
          publisher: { name: 'Marvel' },
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
        series: {
          title: 'Beta',
          volume: 2,
          startyear: 2019,
          endyear: 2021,
          publisher: { name: 'DC' },
        },
      },
    ]);

    const csv = await service.export({ us: true } as any, 'csv', true);
    const findAllArgs = (models.Issue.findAll as jest.Mock).mock.calls[0][0];
    expect(findAllArgs.limit).toBeUndefined();
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
        series: {
          title: 'Gamma',
          volume: 1,
          startyear: 2024,
          endyear: 0,
          publisher: { name: 'Panini' },
        },
      },
    ]);

    const txt = await service.export(
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

    expect(txt).toContain('Anzahl Ergebnisse: 1');
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

  it('exports txt with series title fallback when generated series label is empty', async () => {
    const { service, models } = createService();
    models.Issue.findAll.mockResolvedValue([
      {
        number: '1',
        format: 'HEFT',
        variant: '',
        pages: 28,
        releasedate: '2024-05-03',
        price: 3.99,
        currency: 'EUR',
        series: {
          title: 'Hawkjet',
          volume: 0,
          startyear: 0,
          endyear: 0,
          publisher: { name: 'Panini - Marvel & Icon' },
        },
      },
    ]);

    const txt = await service.export({ us: false } as any, 'txt', false);

    expect(txt).toContain('Anzahl Ergebnisse: 1');
    expect(txt).toContain('Panini - Marvel & Icon');
    expect(txt).toContain('\tHawkjet\n');
    expect(txt).toContain('\t\t#1\n');
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
