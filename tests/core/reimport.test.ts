const ENV_SNAPSHOT = { ...process.env };

type MockSeries = {
  id: number;
  title: string;
  volume: number;
  publisher?: { id: number; name: string; original: boolean };
};

type MockIssue = {
  id: number;
  number: string;
  format?: string;
  variant: string;
  fk_series: number;
  series?: MockSeries;
  stories?: Array<{ id: number; number: number; title?: string; fk_parent: number | null; fk_reprint?: number | null }>;
};

const createModelMocks = () => {
  const models = {
    Series: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    Issue: {
      count: jest.fn().mockResolvedValue(1),
      findAll: jest.fn(),
      findByPk: jest.fn(),
    },
    Story: {
      findAll: jest.fn(),
    },
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const crawler = {
    crawlIssue: jest.fn(),
    crawlSeries: jest.fn(),
  };

  const axios = {
    get: jest.fn(),
  };

  return { models, logger, crawler, axios };
};

const createDeSeries = (overrides?: Partial<MockSeries>): MockSeries => ({
  id: 10,
  title: 'Spider-Man',
  volume: 1,
  publisher: { id: 1, name: 'Panini', original: false },
  ...overrides,
});

const createDeIssue = (overrides?: Partial<MockIssue>): MockIssue => ({
  id: 100,
  number: '1',
  format: 'Comic',
  variant: '',
  fk_series: 10,
  series: createDeSeries(),
  stories: [{ id: 201, number: 1, title: 'Story', fk_parent: 301 }],
  ...overrides,
});

const createUsIssue = (overrides?: Partial<MockIssue>): MockIssue => ({
  id: 500,
  number: '1',
  format: 'Comic',
  variant: '',
  fk_series: 50,
  series: {
    id: 50,
    title: 'Amazing Spider-Man',
    volume: 1,
    publisher: { id: 2, name: 'Marvel Comics', original: true },
  },
  stories: [{ id: 301, number: 1, title: 'Story', fk_parent: null, fk_reprint: null }],
  ...overrides,
});

const createLoadedIssueRecord = <T extends Record<string, unknown>>(values: T) => ({
  get: () => values,
});

const createPersistableIssueGraph = (overrides?: Partial<Record<string, unknown>>) => ({
  id: 500,
  title: '',
  number: '1',
  format: 'Comic',
  variant: '',
  releasedate: '2024-01-01',
  legacy_number: '',
  pages: 0,
  price: 0,
  currency: 'USD',
  verified: false,
  collected: false,
  comicguideid: '0',
  isbn: '',
  limitation: '0',
  addinfo: '',
  covers: [],
  individuals: [],
  arcs: [],
  ...overrides,
});

const createSourceModelsForEvaluationCacheIsolationTest = () => {
  const deSeries = createDeSeries();
  const usSeries = {
    id: 50,
    title: 'Amazing Spider-Man',
    volume: 1,
    publisher: { id: 2, name: 'Marvel Comics', original: true },
  };

  const deIssue = createDeIssue({
    stories: [{ id: 201, number: 1, title: 'Story', fk_parent: 301 }],
  });

  const sourceUsIssue = createUsIssue({
    id: 500,
    number: '1',
    stories: [{ id: 301, number: 1, title: 'Story', fk_parent: null, fk_reprint: null }],
  });

  const sourceUsIssueGraph = createPersistableIssueGraph({
    id: 500,
    number: '1',
    fk_series: 50,
    series: usSeries,
    stories: [{ id: 301, number: 1, title: 'Story', fk_parent: null, fk_reprint: null }],
  });

  const deIssueGraph = createPersistableIssueGraph({
    id: 100,
    fk_series: 10,
    series: deSeries,
    stories: [{ id: 201, number: 1, title: 'Story', fk_parent: 301 }],
  });

  return {
    Series: {
      count: jest.fn().mockResolvedValue(1),
      findAll: jest.fn().mockImplementation(async ({ offset }: { offset?: number }) => (offset && offset > 0 ? [] : [deSeries])),
    },
    Publisher: {},
    Issue: {
      count: jest.fn().mockResolvedValue(1),
      findAll: jest.fn().mockImplementation(async ({ where }: { where?: { number?: string } }) => {
        if (where?.number) {
          return [createLoadedIssueRecord(sourceUsIssueGraph)];
        }
        return [deIssue];
      }),
      findByPk: jest.fn().mockImplementation(async (issueId: number) => {
        if (issueId === 500) return sourceUsIssue;
        if (issueId === 100) return createLoadedIssueRecord(deIssueGraph);
        return null;
      }),
    },
    Story: {
      findAll: jest.fn().mockResolvedValue([{ id: 301, fk_issue: 500, fk_reprint: null }]),
    },
    Individual: {},
    Appearance: {},
    Cover: {},
    Arc: {},
  };
};

const createTargetModelsForEvaluationCacheIsolationTest = (issueCount: number) => {
  const makeRecord = <T extends Record<string, unknown>>(values: T) => ({
    ...values,
    save: jest.fn().mockResolvedValue(undefined),
  });

  let publisherId = 1000;
  let seriesId = 2000;
  let issueId = 3000;
  let storyId = 4000;

  const publishers = new Map<string, ReturnType<typeof makeRecord>>();
  const series = new Map<string, ReturnType<typeof makeRecord>>();
  const issues = new Map<string, ReturnType<typeof makeRecord>>();

  return {
    Publisher: {
      findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
        const key = JSON.stringify(where);
        if (!publishers.has(key)) {
          publishers.set(key, makeRecord({ id: publisherId++, ...defaults }));
        }
        return [publishers.get(key), false];
      }),
    },
    Series: {
      findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
        const key = JSON.stringify(where);
        if (!series.has(key)) {
          series.set(key, makeRecord({ id: seriesId++, ...defaults }));
        }
        return [series.get(key), false];
      }),
    },
    Issue: {
      count: jest.fn().mockResolvedValue(issueCount),
      findOne: jest.fn().mockResolvedValue(null),
      findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
        const key = JSON.stringify(where);
        if (!issues.has(key)) {
          issues.set(key, makeRecord({ id: issueId++, ...defaults }));
        }
        return [issues.get(key), false];
      }),
    },
    Story: {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async (values) => makeRecord({ id: storyId++, ...values })),
      update: jest.fn().mockResolvedValue([0]),
    },
    Individual: {},
    Appearance: {},
    Cover: {
      findOrCreate: jest.fn(),
    },
    Arc: {},
    Issue_Individual: {
      findOrCreate: jest.fn(),
    },
    Cover_Individual: {
      findOrCreate: jest.fn(),
    },
    Story_Individual: {
      create: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Story_Appearance: {
      create: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Issue_Arc: {
      findOrCreate: jest.fn(),
    },
  };
};

const loadModule = () => {
  const mocks = createModelMocks();
  jest.resetModules();

  jest.doMock('../../src/models', () => ({
    __esModule: true,
    default: mocks.models,
  }));

  jest.doMock('../../src/util/logger', () => ({
    __esModule: true,
    default: mocks.logger,
  }));

  jest.doMock('../../src/services/MarvelCrawlerService', () => ({
    MarvelCrawlerService: jest.fn().mockImplementation(() => mocks.crawler),
  }));

  jest.doMock('axios', () => ({
    __esModule: true,
    default: mocks.axios,
  }));

  jest.doMock('../../src/core/db-model-factory', () => ({
    __esModule: true,
    createDbModels: jest.fn(() => mocks.models),
    closeDbModels: jest.fn(),
  }));

  const module = require('../../src/core/reimport');
  return {
    ...mocks,
    runReimport: module.runReimport,
  };
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('reimport core', () => {
  it('returns an empty dry-run report for empty DE scope', async () => {
    const { runReimport, models } = loadModule();

    models.Series.count.mockResolvedValueOnce(0);
    models.Series.findAll.mockResolvedValueOnce([]);

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });

    expect(report.dryRun).toBe(true);
    expect(report.summary.totalDeSeries).toBe(0);
    expect(report.summary.totalDeIssues).toBe(0);
    expect(report.summary.totalMappedUsIssues).toBe(0);
  });

  it('chooses crawler when story count matches', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(createUsIssue());

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [{ number: 1, title: 'Story' }],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(crawler.crawlIssue).toHaveBeenCalledWith('Amazing Spider-Man', 1, '1');
    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('ok');
    expect(usIssue.reason).toBe('ok');
    expect(usIssue.moved).toBe(false);
    expect(report.series[0].issues[0].status).toBe('ok');
  });

  it('deduplicates source stories by number before comparing story counts', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Backup Story', fk_parent: null, fk_reprint: null },
          { id: 303, number: 3, title: '3rd Story', fk_parent: null, fk_reprint: null },
          { id: 304, number: 3, title: '3rd story', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'Main Story' },
        { number: 2, title: 'Backup Story' },
        { number: 3, title: '' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('ok');
    expect(usIssue.reason).toBe('ok');
    expect(usIssue.shortboxStoryCount).toBe(3);
    expect(usIssue.crawledStoryCount).toBe(3);
  });

  it('maps duplicate source story numbers to the same crawled story index', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
          { id: 302, number: 3, title: '3rd Story', fk_parent: null, fk_reprint: null },
          { id: 303, number: 3, title: '3rd story', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'Main Story' },
        { number: 2, title: 'Inserted Story' },
        { number: 3, title: '' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.reason).toBe('story-count-mismatch-subset');
    expect(usIssue.storyMappings).toEqual([
      {
        sourceStoryId: 301,
        sourceStoryNumber: 1,
        sourceStoryTitle: 'Main Story',
        crawledStoryIndex: 0,
        crawledStoryNumber: 1,
        crawledStoryTitle: 'Main Story',
      },
      {
        sourceStoryId: 302,
        sourceStoryNumber: 3,
        sourceStoryTitle: '3rd Story',
        crawledStoryIndex: 2,
        crawledStoryNumber: 3,
        crawledStoryTitle: 'Untitled',
      },
      {
        sourceStoryId: 303,
        sourceStoryNumber: 3,
        sourceStoryTitle: '3rd story',
        crawledStoryIndex: 2,
        crawledStoryNumber: 3,
        crawledStoryTitle: 'Untitled',
      },
    ]);
  });

  it('chooses crawler and exposes direction when crawler has more stories', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [{ id: 301, number: 1, title: 'Missing Story', fk_parent: null, fk_reprint: null }],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [{ number: 1, title: 'Story' }, { number: 2, title: 'Backup' }],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('check');
    expect(usIssue.reason).toBe('story-count-mismatch-subset');
    expect(usIssue.shortboxStoryCount).toBe(1);
    expect(usIssue.crawledStoryCount).toBe(2);
    expect(usIssue.storyCountDirection).toBe('crawler-has-more-stories');
  });

  it('chooses crawler when shortbox story titles are a subset of crawled stories despite count mismatch', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Backup Story', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'Main Story' },
        { number: 2, title: 'Inserted Story' },
        { number: 3, title: 'Backup Story' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('ok');
    expect(usIssue.reason).toBe('story-count-mismatch-subset');
    expect(usIssue.storyTitleSubset).toBe(true);
    expect(usIssue.storyCountDirection).toBe('crawler-has-more-stories');
    expect(usIssue.storyMappings).toEqual([
      {
        sourceStoryId: 301,
        sourceStoryNumber: 1,
        sourceStoryTitle: 'Main Story',
        crawledStoryIndex: 0,
        crawledStoryNumber: 1,
        crawledStoryTitle: 'Main Story',
      },
      {
        sourceStoryId: 302,
        sourceStoryNumber: 2,
        sourceStoryTitle: 'Backup Story',
        crawledStoryIndex: 2,
        crawledStoryNumber: 3,
        crawledStoryTitle: 'Backup Story',
      },
    ]);
    expect(report.series[0].issues[0].status).toBe('ok');
  });

  it('marks subset matches as check when titles only contain each other', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Backup Feature', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'The Main Story' },
        { number: 2, title: 'Inserted Story' },
        { number: 3, title: 'Backup Feature Extended' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('check');
    expect(usIssue.reason).toBe('story-count-mismatch-subset');
    expect(usIssue.storyTitleSubset).toBe(true);
    expect(usIssue.storyMappings).toEqual([
      {
        sourceStoryId: 301,
        sourceStoryNumber: 1,
        sourceStoryTitle: 'Main Story',
        crawledStoryIndex: 0,
        crawledStoryNumber: 1,
        crawledStoryTitle: 'The Main Story',
      },
      {
        sourceStoryId: 302,
        sourceStoryNumber: 2,
        sourceStoryTitle: 'Backup Feature',
        crawledStoryIndex: 2,
        crawledStoryNumber: 3,
        crawledStoryTitle: 'Backup Feature Extended',
      },
    ]);
    expect(report.series[0].issues[0].status).toBe('check');
  });

  it('maps source stories to the matching crawled stories when extra stories are inserted in the middle', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Story A', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Story B', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'Story A' },
        { number: 2, title: 'Story XYZ' },
        { number: 3, title: 'Story B' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.reason).toBe('story-count-mismatch-subset');
    expect(usIssue.storyMappings).toEqual([
      {
        sourceStoryId: 301,
        sourceStoryNumber: 1,
        sourceStoryTitle: 'Story A',
        crawledStoryIndex: 0,
        crawledStoryNumber: 1,
        crawledStoryTitle: 'Story A',
      },
      {
        sourceStoryId: 302,
        sourceStoryNumber: 2,
        sourceStoryTitle: 'Story B',
        crawledStoryIndex: 2,
        crawledStoryNumber: 3,
        crawledStoryTitle: 'Story B',
      },
    ]);
  });

  it('marks title mismatches for review when story counts match but titles do not match', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Alpha', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Beta', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [
        { number: 1, title: 'Gamma' },
        { number: 2, title: 'Delta' },
      ],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('crawler');
    expect(usIssue.status).toBe('check');
    expect(usIssue.reason).toBe('story-title-mismatch');
    expect(usIssue.shortboxStoryCount).toBe(2);
    expect(usIssue.crawledStoryCount).toBe(2);
    expect(usIssue.unmatchedShortboxStoryTitles).toEqual(['alpha', 'beta']);
    expect(usIssue.unmatchedCrawledStoryTitles).toEqual(['gamma', 'delta']);
    expect(usIssue.storyMappings).toEqual([
      {
        sourceStoryId: 301,
        sourceStoryNumber: 1,
        sourceStoryTitle: 'Alpha',
        crawledStoryIndex: 0,
        crawledStoryNumber: 1,
        crawledStoryTitle: 'Gamma',
      },
      {
        sourceStoryId: 302,
        sourceStoryNumber: 2,
        sourceStoryTitle: 'Beta',
        crawledStoryIndex: 1,
        crawledStoryNumber: 2,
        crawledStoryTitle: 'Delta',
      },
    ]);
  });

  it('marks moved when the crawler resolves another series but story count matches', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(createUsIssue());

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 2 },
      stories: [{ number: 1, title: 'Story' }],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('moved');
    expect(usIssue.reason).toBe('ok');
    expect(usIssue.moved).toBe(true);
  });

  it('chooses shortbox when the issue is not found', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(createUsIssue());

    crawler.crawlIssue.mockRejectedValueOnce(new Error('No parse.text'));

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('shortbox');
    expect(usIssue.reason).toBe('not-found');
  });

  it('chooses manual when the source has more stories than the crawler', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: null }]);
    models.Issue.findByPk.mockResolvedValueOnce(
      createUsIssue({
        stories: [
          { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
          { id: 302, number: 2, title: 'Backup Story', fk_parent: null, fk_reprint: null },
        ],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1 },
      stories: [{ number: 1, title: 'Main Story' }],
    });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const usIssue = report.series[0].issues[0].usIssues[0];

    expect(usIssue.result).toBe('manual');
    expect(usIssue.status).toBe('check');
    expect(usIssue.reason).toBe('story-count-mismatch');
    expect(usIssue.storyCountDirection).toBe('crawler-has-fewer-stories');
    expect(usIssue.moved).toBe(false);
  });

  it('persists source data for a DE issue when any linked US issue is manual', async () => {
    const { runReimport, crawler } = loadModule();

    const deSeries = createDeSeries();
    const sourceUsIssue = createUsIssue({
      stories: [
        { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: 'Backup Story', fk_parent: null, fk_reprint: null },
      ],
    });
    const sourceUsIssueGraph = createPersistableIssueGraph({
      id: 500,
      number: '1',
      fk_series: 50,
      series: sourceUsIssue.series,
      stories: [
        { id: 301, number: 1, title: 'Main Story', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: 'Backup Story', fk_parent: null, fk_reprint: null },
      ],
    });
    const deIssue = createDeIssue({
      stories: [{ id: 201, number: 1, title: 'Story', fk_parent: 301 }],
    });
    const deIssueGraph = createPersistableIssueGraph({
      id: 100,
      fk_series: 10,
      series: deSeries,
      stories: [{ id: 201, number: 1, title: 'Story', fk_parent: 301 }],
    });

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ offset }: { offset?: number }) => (offset && offset > 0 ? [] : [deSeries])),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ where }: { where?: { fk_series?: number; number?: string } }) => {
          if (where?.number === '1' && where?.fk_series === 50) {
            return [createLoadedIssueRecord(sourceUsIssueGraph)];
          }
          return [deIssue];
        }),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) return sourceUsIssue;
          if (issueId === 100) return createLoadedIssueRecord(deIssueGraph);
          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([{ id: 301, fk_issue: 500, fk_reprint: null }]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [{ number: 1, title: 'Main Story' }],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('manual');
    expect(report.series[0].issues[0].status).toBe('manual');
    expect(targetModels.Issue.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Publisher.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Series.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Story.create).toHaveBeenCalled();
  });

  it('persists source data for a DE issue when a crawled US issue cannot resolve every parent story mapping', async () => {
    const { runReimport, crawler } = loadModule();

    const deSeries = createDeSeries();
    const sourceUsIssue = createUsIssue({
      stories: [
        { id: 301, number: 1, title: 'Story A', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: 'Story B', fk_parent: null, fk_reprint: null },
      ],
    });
    const sourceUsIssueGraph = createPersistableIssueGraph({
      id: 500,
      number: '1',
      fk_series: 50,
      series: sourceUsIssue.series,
      stories: [
        { id: 301, number: 1, title: 'Story A', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: 'Story B', fk_parent: null, fk_reprint: null },
      ],
    });
    const deIssueGraph = createPersistableIssueGraph({
      id: 100,
      fk_series: 10,
      series: deSeries,
      stories: [{ id: 201, number: 1, title: 'Story B', fk_parent: 302 }],
    });

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ offset }: { offset?: number }) => (offset && offset > 0 ? [] : [deSeries])),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ where }: { where?: { fk_series?: number; number?: string } }) => {
          if (where?.number === '1' && where?.fk_series === 50) {
            return [createLoadedIssueRecord(sourceUsIssueGraph)];
          }
          return [createDeIssue({ stories: [{ id: 201, number: 1, title: 'Story B', fk_parent: 302 }] })];
        }),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) return sourceUsIssue;
          if (issueId === 100) return createLoadedIssueRecord(deIssueGraph);
          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([{ id: 302, fk_issue: 500, fk_reprint: null }]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [
        { number: 1, title: 'Story A' },
        { number: 99, title: 'Different Story' },
      ],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(report.series[0].issues[0].usIssues[0].reason).toBe('story-title-mismatch');
    expect(report.series[0].issues[0].status).toBe('manual');
    expect(targetModels.Issue.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Publisher.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Series.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Story.create).toHaveBeenCalled();
  });

  it('persists a DE issue as check when linked US issues only differ by same-number story titles', async () => {
    const { runReimport, crawler } = loadModule();

    const deSeries = createDeSeries();
    const sourceUsIssue = createUsIssue({
      number: '2',
      stories: [{ id: 301, number: 1, title: 'Chapter 2: Believe', fk_parent: null, fk_reprint: null }],
    });
    const sourceUsIssueGraph = createPersistableIssueGraph({
      id: 500,
      number: '2',
      fk_series: 50,
      series: sourceUsIssue.series,
      stories: [{ id: 301, number: 1, title: 'Chapter 2: Believe', fk_parent: null, fk_reprint: null }],
    });
    const deIssue = createDeIssue({
      stories: [{ id: 201, number: 1, title: 'Kapitel 2', fk_parent: 301 }],
    });
    const deIssueGraph = createPersistableIssueGraph({
      id: 100,
      fk_series: 10,
      number: '91',
      series: deSeries,
      stories: [{ id: 201, number: 1, title: 'Kapitel 2', fk_parent: 301 }],
    });

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ offset }: { offset?: number }) => (offset && offset > 0 ? [] : [deSeries])),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ where }: { where?: { fk_series?: number; number?: string } }) => {
          if (where?.number === '2' && where?.fk_series === 50) return [createLoadedIssueRecord(sourceUsIssueGraph)];
          return [deIssue];
        }),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) return sourceUsIssue;
          if (issueId === 100) return createLoadedIssueRecord(deIssueGraph);
          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([{ id: 301, fk_issue: 500, fk_reprint: null }]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '2',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [{ number: 1, title: 'Chapter Two: Believe' }],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(report.series[0].issues[0].usIssues[0].status).toBe('check');
    expect(report.series[0].issues[0].usIssues[0].reason).toBe('story-title-mismatch');
    expect(report.series[0].issues[0].status).toBe('check');
    expect(targetModels.Issue.findOrCreate).toHaveBeenCalled();
    expect(targetModels.Story.create).toHaveBeenCalled();
  });

  it('follows fk_reprint chains and evaluates all referenced US issues', async () => {
    const { runReimport, models, crawler } = loadModule();

    models.Series.count.mockResolvedValueOnce(1);
    models.Series.findAll.mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([createDeIssue()]);
    models.Story.findAll
      .mockResolvedValueOnce([{ id: 301, fk_issue: 500, fk_reprint: 302 }])
      .mockResolvedValueOnce([{ id: 302, fk_issue: 501, fk_reprint: null }]);
    models.Issue.findByPk
      .mockResolvedValueOnce(createUsIssue({ id: 500, stories: [{ id: 301, number: 1, fk_parent: null, fk_reprint: 302 }] }))
      .mockResolvedValueOnce(createUsIssue({ id: 501, number: '2', stories: [{ id: 302, number: 1, fk_parent: null, fk_reprint: null }] }));

    crawler.crawlIssue
      .mockResolvedValueOnce({ number: '1', series: { title: 'Amazing Spider-Man', volume: 1 }, stories: [{ number: 1, title: 'Story' }] })
      .mockResolvedValueOnce({ number: '2', series: { title: 'Amazing Spider-Man', volume: 1 }, stories: [{ number: 1, title: 'Story' }] });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });
    const linked = report.series[0].issues[0].linkedUsIssueIds;

    expect(linked).toEqual([500, 501]);
    expect(report.series[0].issues[0].usIssues).toHaveLength(2);
  });

  it('runs the DE completeness fast path in default prod runs', async () => {
    const { runReimport, crawler } = loadModule();
    const sourceModels = createSourceModelsForEvaluationCacheIsolationTest();
    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    targetModels.Issue.findOne.mockResolvedValue(
      createLoadedIssueRecord({
        id: 9000,
        stories: [{ id: 9001, number: 1, title: 'Story', fk_parent: 999 }],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [{ number: 1, title: 'Story' }],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.summary.totalMappedUsIssues).toBe(1);
    expect(report.series[0].issues[0].linkedUsIssueIds).toEqual([]);
    expect(report.series[0].issues[0].usIssues).toEqual([]);
    expect(targetModels.Issue.findOne).toHaveBeenCalledTimes(1);
    expect(targetModels.Issue.count).not.toHaveBeenCalled();
    expect(crawler.crawlIssue).not.toHaveBeenCalled();
  });

  it('keeps using the DE completeness fast path when explicitly enabled', async () => {
    const { runReimport, crawler } = loadModule();
    const sourceModels = createSourceModelsForEvaluationCacheIsolationTest();
    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    targetModels.Issue.findOne.mockResolvedValue(
      createLoadedIssueRecord({
        id: 9000,
        stories: [{ id: 9001, number: 1, title: 'Story', fk_parent: 999 }],
      }),
    );

    const report = await runReimport({
      dryRun: false,
      enableTargetDeFastPath: true,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.summary.totalMappedUsIssues).toBe(1);
    expect(report.series[0].issues[0].linkedUsIssueIds).toEqual([]);
    expect(report.series[0].issues[0].usIssues).toEqual([]);
    expect(targetModels.Issue.findOne).toHaveBeenCalledTimes(1);
    expect(targetModels.Issue.count).not.toHaveBeenCalled();
    expect(crawler.crawlIssue).not.toHaveBeenCalled();
  });

  it('does not skip a prod reimport when the target DE issue is missing required parents', async () => {
    const { runReimport, crawler } = loadModule();
    const sourceModels = createSourceModelsForEvaluationCacheIsolationTest();
    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    targetModels.Issue.findOne.mockResolvedValue(
      createLoadedIssueRecord({
        id: 9000,
        stories: [{ id: 9001, number: 1, title: 'Story', fk_parent: null }],
      }),
    );

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [{ number: 1, title: 'Story' }],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(targetModels.Issue.findOne).toHaveBeenCalledTimes(1);
    expect(crawler.crawlIssue).toHaveBeenCalledTimes(1);
  });

  it('caches target issue group existence checks for repeated US issue groups in prod mode', async () => {
    const { runReimport, crawler } = loadModule();

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest
          .fn()
          .mockResolvedValueOnce([
            createDeIssue({
              stories: [
                { id: 201, number: 1, title: 'Story A', fk_parent: 301 },
                { id: 202, number: 2, title: 'Story B', fk_parent: 302 },
              ],
            }),
          ])
          .mockResolvedValueOnce([
            {
              get: () =>
                ({
                  id: 500,
                  title: '',
                  number: '1',
                  format: 'Comic',
                  variant: '',
                  releasedate: '2024-01-01',
                  legacy_number: '',
                  pages: 0,
                  price: 0,
                  currency: 'USD',
                  verified: false,
                  collected: false,
                  comicguideid: '0',
                  isbn: '',
                  limitation: '0',
                  addinfo: '',
                  series: {
                    id: 50,
                    title: 'Amazing Spider-Man',
                    volume: 1,
                    publisher: { id: 2, name: 'Marvel Comics', original: true },
                  },
                  stories: [{ id: 301, number: 1, title: 'Story A', fk_reprint: null }],
                  covers: [],
                  individuals: [],
                  arcs: [],
                }) as never,
            },
            {
              get: () =>
                ({
                  id: 501,
                  title: '',
                  number: '1',
                  format: 'Comic',
                  variant: 'Variant',
                  releasedate: '2024-01-01',
                  legacy_number: '',
                  pages: 0,
                  price: 0,
                  currency: 'USD',
                  verified: false,
                  collected: false,
                  comicguideid: '0',
                  isbn: '',
                  limitation: '0',
                  addinfo: '',
                  series: {
                    id: 50,
                    title: 'Amazing Spider-Man',
                    volume: 1,
                    publisher: { id: 2, name: 'Marvel Comics', original: true },
                  },
                  stories: [{ id: 302, number: 1, title: 'Story B', fk_reprint: null }],
                  covers: [],
                  individuals: [],
                  arcs: [],
                }) as never,
            },
          ]),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) {
            return createUsIssue({
              id: 500,
              number: '1',
              stories: [{ id: 301, number: 1, title: 'Story A', fk_parent: null, fk_reprint: null }],
            });
          }

          if (issueId === 501) {
            return createUsIssue({
              id: 501,
              number: '1',
              stories: [{ id: 302, number: 1, title: 'Story B', fk_parent: null, fk_reprint: null }],
            });
          }

          if (issueId === 100) {
            return {
              get: () => ({
                id: 100,
                title: '',
                number: '1',
                format: 'Comic',
                variant: '',
                releasedate: '2024-01-01',
                legacy_number: '',
                pages: 0,
                price: 0,
                currency: 'USD',
                verified: false,
                collected: false,
                comicguideid: '0',
                isbn: '',
                limitation: '0',
                addinfo: '',
                fk_series: 10,
                series: createDeSeries(),
                stories: [
                  { id: 201, number: 1, title: 'Story A', fk_parent: 301 },
                  { id: 202, number: 2, title: 'Story B', fk_parent: 302 },
                ],
                covers: [],
                individuals: [],
                arcs: [],
              }),
            };
          }

          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([
          { id: 301, fk_issue: 500, fk_reprint: null },
          { id: 302, fk_issue: 501, fk_reprint: null },
        ]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const makeRecord = <T extends Record<string, unknown>>(values: T) => ({
      ...values,
      save: jest.fn().mockResolvedValue(undefined),
    });

    let publisherId = 1000;
    let seriesId = 2000;
    let issueId = 3000;
    let storyId = 4000;

    const publishers = new Map<string, ReturnType<typeof makeRecord>>();
    const series = new Map<string, ReturnType<typeof makeRecord>>();
    const issues = new Map<string, ReturnType<typeof makeRecord>>();

    const targetModels = {
      Publisher: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!publishers.has(key)) {
            publishers.set(key, makeRecord({ id: publisherId++, ...defaults }));
          }
          return [publishers.get(key), false];
        }),
      },
      Series: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!series.has(key)) {
            series.set(key, makeRecord({ id: seriesId++, ...defaults }));
          }
          return [series.get(key), false];
        }),
      },
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findOne: jest.fn().mockResolvedValue(null),
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!issues.has(key)) {
            issues.set(key, makeRecord({ id: issueId++, ...defaults }));
          }
          return [issues.get(key), false];
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        create: jest.fn().mockImplementation(async (values) => makeRecord({ id: storyId++, ...values })),
        update: jest.fn().mockResolvedValue([0]),
      },
      Individual: {},
      Appearance: {},
      Cover: {
        findOrCreate: jest.fn(),
      },
      Arc: {},
      Issue_Individual: {
        findOrCreate: jest.fn(),
      },
      Cover_Individual: {
        findOrCreate: jest.fn(),
      },
      Story_Individual: {
        create: jest.fn(),
        findOrCreate: jest.fn(),
      },
      Story_Appearance: {
        create: jest.fn(),
        findOrCreate: jest.fn(),
      },
      Issue_Arc: {
        findOrCreate: jest.fn(),
      },
    };

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues).toHaveLength(2);
    expect(report.series[0].issues[0].usIssues.every((issue) => issue.result === 'shortbox')).toBe(true);
    expect(report.series[0].issues[0].usIssues.every((issue) => issue.reason === 'target-existing')).toBe(
      true,
    );
    expect(targetModels.Issue.count).toHaveBeenCalledTimes(1);
    expect(crawler.crawlIssue).not.toHaveBeenCalled();
  });

  it('preloads target stories once per issue and reuses target entity caches during prod persistence', async () => {
    const { runReimport, crawler } = loadModule();

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockResolvedValueOnce([createDeSeries()]).mockResolvedValueOnce([]),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockResolvedValueOnce([
          createDeIssue({
            stories: [
              { id: 201, number: 1, title: 'Story A', fk_parent: 301 },
              { id: 202, number: 2, title: 'Story B', fk_parent: 302 },
            ],
          }),
        ]),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) {
            return createUsIssue({
              id: 500,
              number: '1',
              stories: [{ id: 301, number: 1, title: 'Story A', fk_parent: null, fk_reprint: null }],
            });
          }

          if (issueId === 501) {
            return createUsIssue({
              id: 501,
              number: '2',
              stories: [{ id: 302, number: 1, title: 'Story B', fk_parent: null, fk_reprint: null }],
            });
          }

          if (issueId === 100) {
            return {
              get: () => ({
              id: 100,
              title: '',
              number: '1',
              format: 'Comic',
              variant: '',
              releasedate: '2024-01-01',
              legacy_number: '',
              pages: 0,
              price: 0,
              currency: 'USD',
              verified: false,
              collected: false,
              comicguideid: '0',
              isbn: '',
              limitation: '0',
              addinfo: '',
              fk_series: 10,
              series: createDeSeries(),
              stories: [
                {
                  id: 201,
                  number: 1,
                  title: 'Story A',
                  fk_parent: 301,
                  individuals: [{ id: 11, name: 'Writer Shared', story_individual: { type: 'WRITER' } }],
                  appearances: [{ id: 21, name: 'Spider-Man', type: 'CHARACTER', story_appearance: { role: '' } }],
                },
                {
                  id: 202,
                  number: 2,
                  title: 'Story B',
                  fk_parent: 302,
                  individuals: [{ id: 12, name: 'Writer Shared', story_individual: { type: 'WRITER' } }],
                  appearances: [{ id: 22, name: 'Spider-Man', type: 'CHARACTER', story_appearance: { role: '' } }],
                },
              ],
              covers: [],
              individuals: [],
              arcs: [{ id: 31, title: 'Shared Arc', type: 'STORYARC' }],
              }),
            };
          }

          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([
          { id: 301, fk_issue: 500, fk_reprint: null },
          { id: 302, fk_issue: 501, fk_reprint: null },
        ]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const makeRecord = <T extends Record<string, unknown>>(values: T) => ({
      ...values,
      save: jest.fn().mockResolvedValue(undefined),
    });

    let publisherId = 1000;
    let seriesId = 2000;
    let issueId = 3000;
    let storyId = 4000;
    let individualId = 5000;
    let appearanceId = 6000;

    const publishers = new Map<string, ReturnType<typeof makeRecord>>();
    const series = new Map<string, ReturnType<typeof makeRecord>>();
    const issues = new Map<string, ReturnType<typeof makeRecord>>();
    const individuals = new Map<string, ReturnType<typeof makeRecord>>();
    const appearances = new Map<string, ReturnType<typeof makeRecord>>();

    const targetModels = {
      Publisher: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!publishers.has(key)) {
            publishers.set(key, makeRecord({ id: publisherId++, ...defaults }));
          }
          return [publishers.get(key), false];
        }),
      },
      Series: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!series.has(key)) {
            series.set(key, makeRecord({ id: seriesId++, ...defaults }));
          }
          return [series.get(key), false];
        }),
      },
      Issue: {
        count: jest.fn().mockResolvedValue(0),
        findOne: jest.fn().mockResolvedValue(null),
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!issues.has(key)) {
            issues.set(key, makeRecord({ id: issueId++, ...defaults }));
          }
          return [issues.get(key), false];
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        create: jest.fn().mockImplementation(async (values) => makeRecord({ id: storyId++, ...values })),
        update: jest.fn().mockResolvedValue([0]),
      },
      Individual: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!individuals.has(key)) {
            individuals.set(key, makeRecord({ id: individualId++, ...defaults }));
          }
          return [individuals.get(key), false];
        }),
      },
      Appearance: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => {
          const key = JSON.stringify(where);
          if (!appearances.has(key)) {
            appearances.set(key, makeRecord({ id: appearanceId++, ...defaults }));
          }
          return [appearances.get(key), false];
        }),
      },
      Arc: {
        findOrCreate: jest.fn().mockImplementation(async ({ where, defaults }) => [
          makeRecord({ id: 7000, ...where, ...defaults }),
          false,
        ]),
      },
      Cover: {
        findOrCreate: jest.fn(),
      },
      Issue_Individual: {
        findOrCreate: jest.fn(),
      },
      Cover_Individual: {
        findOrCreate: jest.fn(),
      },
      Story_Individual: {
        create: jest.fn().mockResolvedValue(undefined),
        findOrCreate: jest.fn(),
      },
      Story_Appearance: {
        create: jest.fn().mockResolvedValue(undefined),
        findOrCreate: jest.fn(),
      },
      Issue_Arc: {
        findOrCreate: jest.fn(),
      },
    };

    crawler.crawlIssue
      .mockResolvedValueOnce({
        number: '1',
        series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
        arcs: [{ title: 'Shared Arc', type: 'STORYARC' }],
        stories: [
          {
            number: 1,
            title: 'Story A',
            individuals: [{ name: 'Writer Shared', type: 'WRITER' }],
            appearances: [{ name: 'Spider-Man', type: 'CHARACTER' }],
          },
        ],
      })
      .mockResolvedValueOnce({
        number: '2',
        series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
        arcs: [{ title: 'Shared Arc', type: 'STORYARC' }],
        stories: [
          {
            number: 1,
            title: 'Story B',
            individuals: [{ name: 'Writer Shared', type: 'WRITER' }],
            appearances: [{ name: 'Spider-Man', type: 'CHARACTER' }],
          },
        ],
      });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(report.series[0].issues[0].usIssues).toHaveLength(2);
    expect(targetModels.Story.findAll).toHaveBeenCalledTimes(3);
    expect(targetModels.Publisher.findOrCreate).toHaveBeenCalledTimes(2);
    expect(targetModels.Series.findOrCreate).toHaveBeenCalledTimes(2);
    expect(targetModels.Individual.findOrCreate).toHaveBeenCalledTimes(1);
    expect(targetModels.Appearance.findOrCreate).toHaveBeenCalledTimes(1);
    expect(targetModels.Arc.findOrCreate).toHaveBeenCalledTimes(1);
    expect(targetModels.Story_Individual.findOrCreate).not.toHaveBeenCalled();
    expect(targetModels.Story_Appearance.findOrCreate).not.toHaveBeenCalled();
    expect(targetModels.Story_Individual.create).toHaveBeenCalledTimes(4);
    expect(targetModels.Story_Appearance.create).toHaveBeenCalledTimes(4);
  });

  it('stores crawler story titles as-is for placeholders and only normalizes empty titles to Untitled', async () => {
    const { runReimport, crawler } = loadModule();

    const deSeries = createDeSeries();
    const deIssue = createDeIssue({
      stories: [
        { id: 201, number: 1, title: '1st Story', fk_parent: 301 },
        { id: 202, number: 2, title: '2nd Story', fk_parent: 302 },
      ],
    });
    const sourceUsIssue = createUsIssue({
      stories: [
        { id: 301, number: 1, title: '1st Story', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: '2nd Story', fk_parent: null, fk_reprint: null },
      ],
    });
    const sourceUsIssueGraph = createPersistableIssueGraph({
      id: 500,
      number: '1',
      fk_series: 50,
      series: sourceUsIssue.series,
      stories: [
        { id: 301, number: 1, title: '1st Story', fk_parent: null, fk_reprint: null },
        { id: 302, number: 2, title: '2nd Story', fk_parent: null, fk_reprint: null },
      ],
    });
    const deIssueGraph = createPersistableIssueGraph({
      id: 100,
      fk_series: 10,
      series: deSeries,
      stories: [
        { id: 201, number: 1, title: '1st Story', fk_parent: 301 },
        { id: 202, number: 2, title: '2nd Story', fk_parent: 302 },
      ],
    });

    const sourceModels = {
      Series: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ offset }: { offset?: number }) => (offset && offset > 0 ? [] : [deSeries])),
      },
      Publisher: {},
      Issue: {
        count: jest.fn().mockResolvedValue(1),
        findAll: jest.fn().mockImplementation(async ({ where }: { where?: { fk_series?: number; number?: string } }) => {
          if (where?.number === '1' && where?.fk_series === 50) return [createLoadedIssueRecord(sourceUsIssueGraph)];
          return [deIssue];
        }),
        findByPk: jest.fn().mockImplementation(async (issueId: number) => {
          if (issueId === 500) return sourceUsIssue;
          if (issueId === 100) return createLoadedIssueRecord(deIssueGraph);
          return null;
        }),
      },
      Story: {
        findAll: jest.fn().mockResolvedValue([
          { id: 301, fk_issue: 500, fk_reprint: null },
          { id: 302, fk_issue: 500, fk_reprint: null },
        ]),
      },
      Individual: {},
      Appearance: {},
      Cover: {},
      Arc: {},
    };

    const targetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [
        { number: 1, title: '1st Story' },
        { number: 2, title: '' },
      ],
    });

    const report = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: targetModels as never,
    });

    expect(report.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(targetModels.Story.create).toHaveBeenCalled();
    expect(targetModels.Story.create.mock.calls[0][0].title).toBe('1st Story');
    expect(targetModels.Story.create.mock.calls[1][0].title).toBe('Untitled');
  });

  it('isolates evaluation decisions across multiple runs in the same process when target state changes', async () => {
    const { runReimport, crawler } = loadModule();
    const sourceModels = createSourceModelsForEvaluationCacheIsolationTest();
    const existingTargetModels = createTargetModelsForEvaluationCacheIsolationTest(1);
    const missingTargetModels = createTargetModelsForEvaluationCacheIsolationTest(0);

    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      series: { title: 'Amazing Spider-Man', volume: 1, publisher: { name: 'Marvel Comics' } },
      stories: [{ number: 1, title: 'Story' }],
    });

    const firstReport = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: existingTargetModels as never,
    });

    const secondReport = await runReimport({
      dryRun: false,
      scope: { kind: 'all-us' },
      sourceModels: sourceModels as never,
      targetModels: missingTargetModels as never,
    });

    expect(firstReport.series[0].issues[0].usIssues[0].result).toBe('shortbox');
    expect(firstReport.series[0].issues[0].usIssues[0].reason).toBe('target-existing');
    expect(secondReport.series[0].issues[0].usIssues[0].result).toBe('crawler');
    expect(existingTargetModels.Issue.count).toHaveBeenCalledTimes(1);
    expect(missingTargetModels.Issue.count).toHaveBeenCalledTimes(1);
    expect(crawler.crawlIssue).toHaveBeenCalledTimes(1);
  });
});
