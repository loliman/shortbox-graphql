const ENV_SNAPSHOT = { ...process.env };

type MockIssue = {
  id: number;
  number: string;
  variant: string;
  fk_series: number;
  releasedate: string;
  price: number;
  currency: string;
  format: string;
  series?: {
    id: number;
    title: string;
    volume: number;
    startyear: number;
    endyear: number;
    publisher?: {
      id: number;
      name: string;
      original: boolean;
    };
  };
  save: jest.Mock<Promise<void>, []>;
};

const createModelMocks = () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };

  const models = {
    sequelize: {
      transaction: jest.fn().mockResolvedValue(transaction),
    },
    Publisher: {
      findOrCreate: jest.fn(),
    },
    Series: {
      findOrCreate: jest.fn(),
    },
    Issue: {
      findAll: jest.fn(),
      findByPk: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      destroy: jest.fn(),
    },
    Story: {
      findAll: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    Cover: {
      findOrCreate: jest.fn(),
    },
    Individual: {
      findOrCreate: jest.fn(),
    },
    Arc: {
      findOrCreate: jest.fn(),
    },
    Appearance: {
      findOrCreate: jest.fn(),
    },
    Issue_Individual: {
      findAll: jest.fn(),
      destroy: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Issue_Arc: {
      findAll: jest.fn(),
      destroy: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Cover_Individual: {
      findAll: jest.fn(),
      destroy: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Story_Individual: {
      findAll: jest.fn(),
      destroy: jest.fn(),
      findOrCreate: jest.fn(),
    },
    Story_Appearance: {
      findAll: jest.fn(),
      destroy: jest.fn(),
      findOrCreate: jest.fn(),
    },
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const crawler = {
    crawlSeries: jest.fn(),
    crawlIssue: jest.fn(),
  };

  return { models, transaction, logger, crawler };
};

const createIssue = (overrides?: Partial<MockIssue>): MockIssue => ({
  id: 100,
  number: '1',
  variant: '',
  fk_series: 10,
  releasedate: '2020-01-01',
  price: 4.99,
  currency: 'USD',
  format: 'HEFT',
  series: {
    id: 10,
    title: 'Old Series',
    volume: 1,
    startyear: 2020,
    endyear: 0,
    publisher: {
      id: 1,
      name: 'Marvel Comics',
      original: true,
    },
  },
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

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
  it('runs dry-run and rolls back for empty scope', async () => {
    const { runReimport, models, transaction } = loadModule();

    models.Issue.findAll.mockResolvedValueOnce([]);

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });

    expect(report?.dryRun).toBe(true);
    expect(report?.summary.total).toBe(0);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('marks issue as manual when story count differs', async () => {
    const { runReimport, models, crawler } = loadModule();

    const issue = createIssue();

    models.Issue.findAll.mockResolvedValueOnce([issue]);

    crawler.crawlSeries.mockResolvedValueOnce({
      title: 'Old Series',
      volume: 1,
      startyear: 2020,
      endyear: 0,
      publisherName: 'Marvel Comics',
    });
    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      releasedate: '2020-01-01',
      price: 4.99,
      currency: 'USD',
      coverUrl: '',
      stories: [{ number: 1, title: '' }, { number: 2, title: '' }],
      cover: { number: 0, url: '', individuals: [] },
      variants: [],
      individuals: [],
      arcs: [],
    });

    models.Publisher.findOrCreate.mockResolvedValueOnce([{ id: 1, name: 'Marvel Comics', original: true }, false]);
    models.Series.findOrCreate.mockResolvedValueOnce([{ id: 10, title: 'Old Series', volume: 1, startyear: 2020, endyear: 0, save: jest.fn().mockResolvedValue(undefined) }, false]);
    models.Issue.findOne.mockResolvedValueOnce(null);
    models.Issue.findByPk.mockResolvedValueOnce(issue);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);
    models.Cover.findOrCreate.mockResolvedValueOnce([
      { id: 500, url: '', number: 0, save: jest.fn().mockResolvedValue(undefined) },
      false,
    ]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 700, number: 1, title: '' }]);
    models.Issue.findAll.mockResolvedValueOnce([]);

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });

    expect(report?.issues[0].status).toBe('manual');
    expect(report?.issues[0].storyCount).toEqual({ local: 1, crawled: 2 });
  });

  it('marks conflict as manual when target issue already exists', async () => {
    const { runReimport, models, crawler } = loadModule();

    const issue = createIssue();

    models.Issue.findAll.mockResolvedValueOnce([issue]);

    crawler.crawlSeries.mockResolvedValueOnce({
      title: 'Moved Series',
      volume: 2,
      startyear: 2024,
      endyear: 0,
      publisherName: 'Marvel Comics',
    });
    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      releasedate: '2024-01-01',
      price: 5.99,
      currency: 'USD',
      seriesTitle: 'Moved Series',
      seriesVolume: 2,
      seriesPublisherName: 'Marvel Comics',
      coverUrl: '',
      stories: [{ number: 1, title: '' }],
      cover: { number: 0, url: '', individuals: [] },
      variants: [],
      individuals: [],
      arcs: [],
    });

    models.Publisher.findOrCreate.mockResolvedValueOnce([{ id: 1, name: 'Marvel Comics', original: true }, false]);
    models.Series.findOrCreate.mockResolvedValueOnce([{ id: 20, title: 'Moved Series', volume: 2, startyear: 2024, endyear: 0, save: jest.fn().mockResolvedValue(undefined) }, false]);
    models.Issue.findOne.mockResolvedValueOnce({ id: 999 });

    const report = await runReimport({ dryRun: true, scope: { kind: 'all-us' } });

    expect(report?.issues[0].status).toBe('manual');
    expect(report?.issues[0].conflicts[0]).toContain('Target issue already exists');
  });

  it('updates issue and commits when run is not dry-run', async () => {
    const { runReimport, models, crawler, transaction } = loadModule();

    const issue = createIssue();

    models.Issue.findAll.mockResolvedValueOnce([issue]);

    crawler.crawlSeries.mockResolvedValueOnce({
      title: 'Moved Series',
      volume: 2,
      startyear: 2024,
      endyear: 0,
      publisherName: 'Marvel Comics',
    });
    crawler.crawlIssue.mockResolvedValueOnce({
      number: '1',
      releasedate: '2024-01-01',
      price: 5.99,
      currency: 'USD',
      seriesTitle: 'Moved Series',
      seriesVolume: 2,
      seriesPublisherName: 'Marvel Comics',
      coverUrl: '',
      stories: [{ number: 1, title: '' }],
      cover: { number: 0, url: '', individuals: [] },
      variants: [],
      individuals: [],
      arcs: [],
    });

    const targetSeries = {
      id: 20,
      title: 'Moved Series',
      volume: 2,
      startyear: 2024,
      endyear: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };

    models.Publisher.findOrCreate.mockResolvedValueOnce([{ id: 1, name: 'Marvel Comics', original: true }, false]);
    models.Series.findOrCreate.mockResolvedValueOnce([targetSeries, false]);
    models.Issue.findOne.mockResolvedValueOnce(null);
    models.Issue.findByPk.mockResolvedValueOnce(issue);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);
    models.Cover.findOrCreate.mockResolvedValueOnce([
      { id: 500, url: '', number: 0, save: jest.fn().mockResolvedValue(undefined) },
      false,
    ]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([{ id: 700, number: 2, title: '' }]);
    models.Story.update.mockResolvedValueOnce([1]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([]);

    const report = await runReimport({ dryRun: false, scope: { kind: 'all-us' } });

    expect(report?.issues[0].status).toBe('updated');
    expect(models.Story.update).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});
