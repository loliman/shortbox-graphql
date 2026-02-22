const ENV_SNAPSHOT = { ...process.env };

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
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Series: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Issue: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Cover: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Story: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Individual: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Appearance: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Arc: {
      findAll: jest.fn(),
      destroy: jest.fn().mockResolvedValue(0),
    },
    Issue_Individual: {
      findAll: jest.fn(),
    },
    Story_Individual: {
      findAll: jest.fn(),
    },
    Cover_Individual: {
      findAll: jest.fn(),
    },
    Story_Appearance: {
      findAll: jest.fn(),
    },
    Issue_Arc: {
      findAll: jest.fn(),
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
  return {
    ...mocks,
    run: module.run,
    cleanup: module.cleanup,
    triggerManualCleanupDryRun: module.triggerManualCleanupDryRun,
  };
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

  it('runs as hard dry-run and returns empty report for empty datasets', async () => {
    process.env.CLEANUP_DRY_RUN = 'true';
    const { run, models, transaction } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Series.findAll.mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([]);
    models.Cover.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Appearance.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);

    const report = await run();

    expect(report).toMatchObject({
      dryRun: true,
      totalAffected: 0,
    });
    expect(report?.stages).toHaveLength(11);

    expect(models.sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('builds a deletion report in requested order and keeps US issues with recursive DE references', async () => {
    process.env.CLEANUP_DRY_RUN = 'true';
    const { run, models, transaction } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([
      { id: 1, name: 'Panini DE', original: false },
      { id: 2, name: 'Marvel US', original: true },
      { id: 3, name: 'Orphan Pub', original: false },
    ]);

    models.Series.findAll.mockResolvedValueOnce([
      { id: 11, title: 'DE Serie', volume: 1, fk_publisher: 1 },
      { id: 22, title: 'US Keep', volume: 1, fk_publisher: 2 },
      { id: 23, title: 'US Remove', volume: 1, fk_publisher: 2 },
      { id: 24, title: 'Series Missing Pub', volume: 1, fk_publisher: 99 },
    ]);

    models.Issue.findAll.mockResolvedValueOnce([
      { id: 101, number: '1', variant: '', fk_series: 11 },
      { id: 201, number: '10', variant: '', fk_series: 22 },
      { id: 205, number: '10', variant: 'Variant Cover', fk_series: 22 },
      { id: 202, number: '11', variant: '', fk_series: 23 },
      { id: 203, number: '99', variant: '', fk_series: 999 },
      { id: 204, number: '100', variant: '', fk_series: 24 },
    ]);

    models.Cover.findAll.mockResolvedValueOnce([{ id: 401, fk_issue: 203 }]);

    models.Story.findAll.mockResolvedValueOnce([
      { id: 301, number: 1, fk_issue: 101, fk_parent: 302, fk_reprint: null },
      { id: 302, number: 1, fk_issue: 201, fk_parent: null, fk_reprint: 303 },
      { id: 303, number: 2, fk_issue: 201, fk_parent: null, fk_reprint: null },
      { id: 304, number: 1, fk_issue: 202, fk_parent: null, fk_reprint: null },
      { id: 305, number: 1, fk_issue: 203, fk_parent: null, fk_reprint: null },
    ]);

    models.Individual.findAll.mockResolvedValueOnce([
      { id: 501, name: 'Linked Person' },
      { id: 502, name: 'Orphan Person' },
    ]);

    models.Appearance.findAll.mockResolvedValueOnce([
      { id: 601, name: 'Linked Appearance', type: 'CHARACTER' },
      { id: 602, name: 'Orphan Appearance', type: 'CHARACTER' },
    ]);

    models.Arc.findAll.mockResolvedValueOnce([
      { id: 701, title: 'Linked Arc', type: 'STORYARC' },
      { id: 702, title: 'Orphan Arc', type: 'STORYARC' },
    ]);

    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([{ fk_individual: 501, fk_story: 302 }]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([{ fk_appearance: 601, fk_story: 302 }]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([{ fk_arc: 701, fk_issue: 201 }]);

    const report = await run();

    expect(report).not.toBeNull();
    expect(report?.dryRun).toBe(true);
    expect(report?.totalAffected).toBe(12);

    const stageByStep = new Map((report?.stages || []).map((stage) => [stage.step, stage]));
    expect(stageByStep.get('-1) Stories without issue (direct orphan)')?.ids).toEqual([]);
    expect(stageByStep.get('0) US issues without any DE reference chain')?.ids).toEqual([202]);
    expect(stageByStep.get('0) US issues without any DE reference chain')?.ids).not.toContain(205);
    expect(stageByStep.get('1) Publisher without series')?.ids).toEqual([3]);
    expect(stageByStep.get('2) Series without issues')?.ids).toEqual([23]);
    expect(stageByStep.get('3) Series without publisher')?.ids).toEqual([24]);
    expect(stageByStep.get('4) Issues without series')?.ids).toEqual([203, 204]);
    expect(stageByStep.get('5) Covers without issue')?.ids).toEqual([401]);
    expect(stageByStep.get('6) Stories without issue (after issue cleanup)')?.ids).toEqual([
      304, 305,
    ]);
    expect(stageByStep.get('7) Individuals without story, cover or issue')?.ids).toEqual([502]);
    expect(stageByStep.get('8) Appearances without story')?.ids).toEqual([602]);
    expect(stageByStep.get('9) Arcs without issue')?.ids).toEqual([702]);

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('supports manual trigger', async () => {
    const { triggerManualCleanupDryRun, models } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Series.findAll.mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([]);
    models.Cover.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Appearance.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);

    const report = await triggerManualCleanupDryRun();
    expect(report?.dryRun).toBe(true);
  });

  it('skips step0 deletion when no US stories are present', async () => {
    process.env.CLEANUP_DRY_RUN = 'true';
    const { run, models } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([
      { id: 1, name: 'Panini DE', original: false },
      { id: 2, name: 'Marvel US', original: true },
    ]);
    models.Series.findAll.mockResolvedValueOnce([
      { id: 11, title: 'DE Serie', volume: 1, fk_publisher: 1 },
      { id: 22, title: 'US Serie', volume: 1, fk_publisher: 2 },
    ]);
    models.Issue.findAll.mockResolvedValueOnce([
      { id: 101, number: '1', variant: '', fk_series: 11 },
      { id: 201, number: '10', variant: '', fk_series: 22 },
    ]);
    models.Cover.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([
      { id: 301, number: 1, fk_issue: 101, fk_parent: null, fk_reprint: null },
    ]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Appearance.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);

    const report = await run();
    const stageMinus1 = report?.stages.find((stage) =>
      stage.step.startsWith('-1) Stories without issue'),
    );
    const stage0 = report?.stages.find((stage) => stage.step.startsWith('0)'));
    expect(stageMinus1?.ids).toEqual([]);
    expect(stage0?.ids).toEqual([]);
  });

  it('removes direct orphan stories in step -1', async () => {
    process.env.CLEANUP_DRY_RUN = 'true';
    const { run, models } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Series.findAll.mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([]);
    models.Cover.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([
      { id: 901, number: 1, fk_issue: null, fk_parent: null, fk_reprint: null },
    ]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Appearance.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);

    const report = await run();
    const stageMinus1 = report?.stages.find((stage) =>
      stage.step.startsWith('-1) Stories without issue'),
    );
    expect(stageMinus1?.ids).toEqual([901]);
  });

  it('rolls back transaction when cleanup dry-run fails', async () => {
    process.env.CLEANUP_DRY_RUN = 'true';
    const { run, models, transaction } = loadCleanupModule();

    models.Publisher.findAll.mockRejectedValueOnce(new Error('db failure'));

    await run();

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  it('commits and executes deletes when dry-run is disabled', async () => {
    const { run, models, transaction } = loadCleanupModule();

    models.Publisher.findAll.mockResolvedValueOnce([]);
    models.Series.findAll.mockResolvedValueOnce([]);
    models.Issue.findAll.mockResolvedValueOnce([]);
    models.Cover.findAll.mockResolvedValueOnce([]);
    models.Story.findAll.mockResolvedValueOnce([
      { id: 901, number: 1, fk_issue: null, fk_parent: null, fk_reprint: null },
    ]);
    models.Individual.findAll.mockResolvedValueOnce([]);
    models.Appearance.findAll.mockResolvedValueOnce([]);
    models.Arc.findAll.mockResolvedValueOnce([]);
    models.Issue_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Individual.findAll.mockResolvedValueOnce([]);
    models.Cover_Individual.findAll.mockResolvedValueOnce([]);
    models.Story_Appearance.findAll.mockResolvedValueOnce([]);
    models.Issue_Arc.findAll.mockResolvedValueOnce([]);

    const report = await run({ dryRun: false });

    expect(report?.dryRun).toBe(false);
    expect(models.Story.destroy).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});
