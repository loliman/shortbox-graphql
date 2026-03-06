const createModelMocks = () => {
  const transaction = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };

  const models = {
    sequelize: {
      transaction: jest.fn().mockResolvedValue(transaction),
    },
    Series: {
      findAll: jest.fn(),
      update: jest.fn().mockResolvedValue([1]),
    },
    Story: {
      findAll: jest.fn(),
    },
    Issue: { modelName: 'Issue' },
    Publisher: { modelName: 'Publisher' },
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  return { models, transaction, logger };
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

  const module = require('../../src/core/update-de-series-genres');
  return {
    ...mocks,
    runUpdateDeSeriesGenres: module.runUpdateDeSeriesGenres as (options?: {
      dryRun?: boolean;
    }) => Promise<Record<string, unknown> | null>,
  };
};

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('update-de-series-genres core', () => {
  it('aggregates and normalizes US genres for DE series in dry-run mode', async () => {
    const { models, transaction, runUpdateDeSeriesGenres } = loadModule();

    models.Series.findAll.mockResolvedValueOnce([
      { id: 1, genre: 'Action' },
      { id: 2, genre: '' },
      { id: 3, genre: 'Mystery' },
    ]);
    models.Story.findAll
      .mockResolvedValueOnce([
        { fk_parent: 101, issue: { fk_series: 1 } },
        { fk_parent: 102, issue: { fk_series: 1 } },
        { fk_parent: 101, issue: { fk_series: 2 } },
      ])
      .mockResolvedValueOnce([
        { id: 101, issue: { series: { genre: 'Action, Sci-Fi' } } },
        { id: 102, issue: { series: { genre: 'Fantasy, sci-fi' } } },
      ]);

    const report = await runUpdateDeSeriesGenres({ dryRun: true });

    expect(report).toMatchObject({
      dryRun: true,
      totalDeSeries: 3,
      processedDeStories: 3,
      resolvedUsParentStories: 2,
      mappedDeSeries: 2,
      updatedSeries: 3,
      unchangedSeries: 0,
      clearedSeries: 1,
    });
    expect(
      (report?.sampleChanges as Array<{ seriesId: number; from: string; to: string }>) || [],
    ).toEqual(
      expect.arrayContaining([
        { seriesId: 1, from: 'Action', to: 'Action, Fantasy, Sci-Fi' },
        { seriesId: 2, from: '', to: 'Action, Sci-Fi' },
        { seriesId: 3, from: 'Mystery', to: '' },
      ]),
    );

    expect(models.Series.update).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('updates only changed DE series genres in non-dry-run mode', async () => {
    const { models, transaction, runUpdateDeSeriesGenres } = loadModule();

    models.Series.findAll.mockResolvedValueOnce([
      { id: 1, genre: 'Action, Fantasy, Sci-Fi' },
      { id: 2, genre: 'Mystery' },
      { id: 3, genre: '' },
    ]);
    models.Story.findAll
      .mockResolvedValueOnce([
        { fk_parent: 101, issue: { fk_series: 1 } },
        { fk_parent: 102, issue: { fk_series: 1 } },
      ])
      .mockResolvedValueOnce([
        { id: 101, issue: { series: { genre: 'Action, Sci-Fi' } } },
        { id: 102, issue: { series: { genre: 'Fantasy' } } },
      ]);

    const report = await runUpdateDeSeriesGenres({ dryRun: false });

    expect(report).toMatchObject({
      dryRun: false,
      totalDeSeries: 3,
      mappedDeSeries: 1,
      updatedSeries: 1,
      unchangedSeries: 2,
      clearedSeries: 1,
    });
    expect(models.Series.update).toHaveBeenCalledTimes(1);
    expect(models.Series.update).toHaveBeenCalledWith(
      { genre: '' },
      expect.objectContaining({ where: { id: 2 } }),
    );
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});
