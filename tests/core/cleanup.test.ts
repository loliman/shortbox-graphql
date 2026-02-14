const ENV_SNAPSHOT = { ...process.env };

type MockEntity = {
  id: number;
  number?: string;
  fk_series?: number;
  destroy: jest.Mock<Promise<void>, [Record<string, unknown>]>;
};

const createEntity = (id: number, extra: Record<string, unknown> = {}): MockEntity =>
  ({
    id,
    destroy: jest.fn().mockResolvedValue(undefined),
    ...extra,
  }) as MockEntity;

const createModelMocks = () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };

  const models = {
    sequelize: {
      transaction: jest.fn().mockResolvedValue(transaction),
    },
    Issue: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    Series: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    Publisher: {
      findAll: jest.fn(),
    },
    Cover: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    Story: {
      findAll: jest.fn(),
      count: jest.fn(),
    },
    Individual: {
      findAll: jest.fn(),
    },
    Arc: {
      findAll: jest.fn(),
    },
    Cover_Individual: {
      count: jest.fn(),
    },
    Story_Individual: {
      count: jest.fn(),
    },
    Feature_Individual: {
      count: jest.fn(),
    },
    Issue_Individual: {
      count: jest.fn(),
    },
    Issue_Arc: {
      count: jest.fn(),
    },
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const cronCtor = jest.fn().mockImplementation((cronExpr, onTick) => ({
    cronExpr,
    onTick,
    start: jest.fn(),
    stop: jest.fn(),
  }));

  return { models, transaction, logger, cronCtor };
};

const loadCleanupModule = () => {
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
  jest.doMock('cron', () => ({
    CronJob: mocks.cronCtor,
  }));

  const module = require('../../src/core/cleanup');
  return { ...mocks, run: module.run, cleanup: module.cleanup };
};

afterEach(() => {
  process.env = { ...ENV_SNAPSHOT };
  jest.resetModules();
  jest.clearAllMocks();
});

describe('cleanup core', () => {
  it('creates a cron job with the configured expression', () => {
    process.env.CLEANUP_CRON = '15 4 * * *';
    const { cronCtor } = loadCleanupModule();

    expect(cronCtor).toHaveBeenCalledTimes(1);
    expect(cronCtor).toHaveBeenCalledWith('15 4 * * *', expect.any(Function), null, false);
  });

  it('commits successfully for empty datasets', async () => {
    const { run, models, transaction, logger } = loadCleanupModule();

    models.Issue.findAll.mockResolvedValueOnce([]);
    models.Series.findAll.mockResolvedValueOnce([]);
    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);

    await run();

    expect(models.sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Cleanup done.');
  });

  it('deletes orphaned records through all cleanup stages', async () => {
    const { run, models, transaction } = loadCleanupModule();

    const issue = { id: 1, number: '10', fk_series: 100 };
    const variant = createEntity(2, { number: '10', fk_series: 100 });
    const cover = createEntity(3);
    const story = createEntity(4);
    const series = createEntity(5);
    const publisher = createEntity(6);
    const individual = createEntity(7);
    const arc = createEntity(8);

    models.Issue.findAll
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([variant])
      .mockResolvedValueOnce([variant]);
    models.Cover.findAll.mockResolvedValueOnce([cover]).mockResolvedValueOnce([cover]);
    models.Cover.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    models.Story.findAll.mockResolvedValueOnce([story]).mockResolvedValueOnce([story]);
    models.Story.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);

    models.Series.findAll.mockResolvedValueOnce([series]);
    models.Issue.count.mockResolvedValueOnce(0);
    models.Publisher.findAll.mockResolvedValueOnce([publisher]);
    models.Series.count.mockResolvedValueOnce(0);

    models.Individual.findAll.mockResolvedValueOnce([individual]);
    models.Cover_Individual.count.mockResolvedValueOnce(0);
    models.Story_Individual.count.mockResolvedValueOnce(0);
    models.Feature_Individual.count.mockResolvedValueOnce(0);
    models.Issue_Individual.count.mockResolvedValueOnce(0);

    models.Arc.findAll.mockResolvedValueOnce([arc]);
    models.Issue_Arc.count.mockResolvedValueOnce(0);

    await run();

    expect(cover.destroy).toHaveBeenCalled();
    expect(story.destroy).toHaveBeenCalled();
    expect(variant.destroy).toHaveBeenCalled();
    expect(series.destroy).toHaveBeenCalled();
    expect(publisher.destroy).toHaveBeenCalled();
    expect(individual.destroy).toHaveBeenCalled();
    expect(arc.destroy).toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('skips deletions when related child records exist', async () => {
    const { run, models, transaction } = loadCleanupModule();

    const issue = { id: 1, number: '1', fk_series: 10 };
    const variant = createEntity(2, { number: '1', fk_series: 10 });
    const cover = createEntity(3);

    models.Issue.findAll
      .mockResolvedValueOnce([issue])
      .mockResolvedValueOnce([variant])
      .mockResolvedValueOnce([variant]);
    models.Cover.findAll.mockResolvedValueOnce([cover]);
    models.Cover.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    models.Series.findAll.mockResolvedValueOnce([]);
    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);

    await run();

    expect(cover.destroy).not.toHaveBeenCalled();
    expect(variant.destroy).not.toHaveBeenCalled();
    expect(models.Story.findAll).not.toHaveBeenCalled();
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  it('rolls back transaction when cleanup fails', async () => {
    const { run, models, transaction, logger } = loadCleanupModule();

    models.Issue.findAll.mockRejectedValueOnce(new Error('db failure'));

    await run();

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Error during cleanup:', expect.any(Error));
  });
});
