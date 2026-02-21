import { IssueService } from '../src/services/IssueService';
import { Op } from 'sequelize';

function createModelLikeIssue(seed: {
  id: number;
  fk_series: number;
  number: string;
  format?: string;
  variant: string;
}) {
  const data = {
    id: seed.id,
    fk_series: seed.fk_series,
    number: seed.number,
    format: seed.format || '',
    variant: seed.variant,
  };
  const modelLikeIssue: Record<string, unknown> = { dataValues: data };
  (['id', 'fk_series', 'number', 'format', 'variant'] as const).forEach((key) => {
    Object.defineProperty(modelLikeIssue, key, {
      configurable: true,
      enumerable: false,
      get: () => data[key],
      set: (value) => {
        (data as Record<string, unknown>)[key] = value;
      },
    });
  });

  return modelLikeIssue;
}

describe('IssueService', () => {
  let issueService: IssueService;
  let mockModels: any;

  beforeEach(() => {
    mockModels = {
      Publisher: {
        findAll: jest.fn(),
        findOne: jest.fn(),
      },
      Issue: {
        findAll: jest.fn(),
        findOne: jest.fn(),
        findByPk: jest.fn(),
        create: jest.fn(),
      },
      Story: {
        findAll: jest.fn(),
      },
      Cover: {
        findAll: jest.fn(),
      },
      Series: {
        findAll: jest.fn(),
        findOne: jest.fn(),
      },
    };
    issueService = new IssueService(mockModels);
  });

  it('should find all issues for a series', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    const mockIssues = [
      { id: 10, number: '1', variant: '', fk_series: 1 },
      { id: 11, number: '2', variant: '', fk_series: 1 },
    ];
    mockModels.Issue.findAll.mockResolvedValue(mockIssues);

    const result = await issueService.findIssues(
      undefined,
      seriesInput,
      2,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.length).toBe(2);
    expect(result.edges[0].node.number).toBe('1');
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [
          ['number', 'ASC'],
          ['variant', 'ASC'],
          ['id', 'ASC'],
        ],
      }),
    );
  });

  it('should sort issue numbers with roman numerals first and natural numeric ordering', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 4, number: '10', variant: '', fk_series: 1 },
      { id: 1, number: 'II', variant: '', fk_series: 1 },
      { id: 5, number: '2', variant: '', fk_series: 1 },
      { id: 2, number: 'I', variant: '', fk_series: 1 },
      { id: 3, number: '1', variant: '', fk_series: 1 },
      { id: 6, number: '11', variant: '', fk_series: 1 },
    ]);

    const result = await issueService.findIssues(
      undefined,
      seriesInput,
      undefined,
      undefined,
      false,
      undefined,
    );
    const numbers = result.edges.map((edge: any) => edge.node.number);

    expect(numbers).toEqual(['I', 'II', '1', '2', '10', '11']);
  });

  it('should return only one API entry per issue number when variants exist', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 101, fk_series: 1, number: '7', variant: 'B' },
      { id: 100, fk_series: 1, number: '7', variant: '' },
      { id: 102, fk_series: 1, number: '8', variant: 'A' },
    ]);

    const result = await issueService.findIssues(
      undefined,
      seriesInput,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges.map((edge: any) => `${edge.node.number}::${edge.node.variant}`)).toEqual([
      '7::',
      '8::',
    ]);
    expect(result.edges.map((edge: any) => edge.node.id)).toEqual([100, 102]);
    expect(result.edges).toHaveLength(2);
  });

  it('should prefer parent formats (HEFT/SC/HC) without variant as navbar representative', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 201, fk_series: 1, number: '9', format: 'Digital', variant: '' },
      { id: 202, fk_series: 1, number: '9', format: 'HC', variant: '' },
      { id: 203, fk_series: 1, number: '9', format: 'HEFT', variant: 'B' },
    ]);

    const result = await issueService.findIssues(
      undefined,
      seriesInput,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].node.id).toBe(202);
    expect(result.edges[0].node.variant).toBe('');
  });

  it('keeps model-like issue fields when only variant issues exist', async () => {
    const seriesInput = {
      title: 'Star Wars',
      volume: 2,
      publisher: { name: 'Panini - Star Wars & Generation' },
    };
    const variantOnlyIssue = createModelLikeIssue({
      id: 12601,
      fk_series: 2,
      number: '126',
      format: 'Heft',
      variant: 'Kiosk Ausgabe',
    });
    mockModels.Issue.findAll.mockResolvedValue([variantOnlyIssue]);

    const result = await issueService.findIssues(
      undefined,
      seriesInput,
      undefined,
      undefined,
      false,
      undefined,
    );

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].node.number).toBe('126');
    expect(result.edges[0].node.format).toBe('Heft');
    expect(result.edges[0].node.variant).toBe('');
  });

  it('should ignore after cursor in findIssues', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    const cursor = Buffer.from('10').toString('base64');
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.findIssues(undefined, seriesInput, 10, cursor, false, undefined);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.limit).toBeUndefined();
    const andKey = Object.getOwnPropertySymbols(options.where).find((key) =>
      String(key).includes('and'),
    );
    expect(andKey).toBeUndefined();
  });

  it('should handle lastEdited with cursor', async () => {
    mockModels.Issue.findAll.mockResolvedValue([{ id: 100, updatedat: new Date() }]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    const result = await issueService.getLastEdited(
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      false,
    );

    expect(result.edges.length).toBe(1);
    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 2,
        order: [
          ['updatedat', 'DESC'],
          ['id', 'DESC'],
        ],
      }),
    );
  });

  it('should sanitize invalid lastEdited order and direction', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    await issueService.getLastEdited(
      undefined,
      10,
      undefined,
      'updatedat; DROP TABLE Issue; --',
      'desc; DROP TABLE User; --',
      false,
    );

    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [
          ['updatedat', 'DESC'],
          ['id', 'DESC'],
        ],
      }),
    );
  });

  it('should support releasedate sorting for lastEdited', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    await issueService.getLastEdited(undefined, 10, undefined, 'releasedate', 'ASC', false);

    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [
          ['releasedate', 'ASC'],
          ['id', 'ASC'],
        ],
      }),
    );
  });

  it('should support series and publisher sorting for lastEdited', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    await issueService.getLastEdited(undefined, 10, undefined, 'series', 'ASC', false);
    await issueService.getLastEdited(undefined, 10, undefined, 'publisher', 'DESC', false);

    const firstCall = mockModels.Issue.findAll.mock.calls[0][0];
    expect(firstCall.order).toEqual([
      [{ model: mockModels.Series, as: 'series' }, 'title', 'ASC'],
      [{ model: mockModels.Series, as: 'series' }, 'volume', 'ASC'],
      ['id', 'ASC'],
    ]);

    const secondCall = mockModels.Issue.findAll.mock.calls[1][0];
    expect(secondCall.order).toEqual([
      [
        { model: mockModels.Series, as: 'series' },
        { model: mockModels.Publisher, as: 'publisher' },
        'name',
        'DESC',
      ],
      [{ model: mockModels.Series, as: 'series' }, 'title', 'DESC'],
      [{ model: mockModels.Series, as: 'series' }, 'volume', 'DESC'],
      ['id', 'DESC'],
    ]);
  });

  it('should build tuple-safe cursor filter for lastEdited', async () => {
    const cursor = Buffer.from('42').toString('base64');
    const cursorDate = new Date('2026-02-12T10:00:00.000Z');

    mockModels.Issue.findByPk.mockResolvedValue({
      get: (field: string) => (field === 'updatedat' ? cursorDate : undefined),
    });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.getLastEdited(undefined, 10, cursor, 'updatedat', 'DESC', false);

    const callArgs = mockModels.Issue.findAll.mock.calls[0][0];
    expect(callArgs.order).toEqual([
      ['updatedat', 'DESC'],
      ['id', 'DESC'],
    ]);

    const andKey = Object.getOwnPropertySymbols(callArgs.where).find((key) =>
      String(key).includes('and'),
    );
    expect(andKey).toBeDefined();
    expect(Array.isArray(callArgs.where[andKey!])).toBe(true);
  });

  it('should always exclude orphan issues without series in lastEdited', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    await issueService.getLastEdited(undefined, 10, undefined, 'updatedat', 'DESC', false);

    const callArgs = mockModels.Issue.findAll.mock.calls[0][0];
    expect(callArgs.where).toEqual(
      expect.objectContaining({
        fk_series: { [Op.ne]: null },
      }),
    );
    expect(callArgs.include[0]).toEqual(
      expect.objectContaining({
        required: true,
      }),
    );
  });

  it('should batch stories/primary cover by issue ids', async () => {
    mockModels.Story.findAll.mockResolvedValue([
      { id: 1, fk_issue: 10, number: 1 },
      { id: 2, fk_issue: 11, number: 1 },
      { id: 3, fk_issue: 10, number: 2 },
    ]);
    mockModels.Cover.findAll.mockResolvedValue([
      { id: 4, fk_issue: 10, number: 0 },
      { id: 5, fk_issue: 10, number: 1 },
      { id: 6, fk_issue: 11, number: 0 },
    ]);
    const stories = await issueService.getStoriesByIssueIds([10, 11]);
    const primaryCovers = await issueService.getPrimaryCoversByIssueIds([10, 11, 12]);

    expect(stories).toHaveLength(2);
    expect(stories[0].map((s: any) => s.id)).toEqual([1, 3]);
    expect(stories[1].map((s: any) => s.id)).toEqual([2]);

    expect(primaryCovers[0]?.id).toBe(4);
    expect(primaryCovers[1]?.id).toBe(6);
    expect(primaryCovers[2]).toBeNull();
  });

  it('should batch variants by series/number key', async () => {
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 101, fk_series: 1, number: '5', variant: 'A' },
      { id: 102, fk_series: 1, number: '5', variant: 'B' },
      { id: 201, fk_series: 2, number: '1', variant: '' },
    ]);

    const variants = await issueService.getVariantsBySeriesAndNumberKeys(['1::5', '2::1', '3::9']);

    expect(variants).toHaveLength(3);
    expect(variants[0].map((v: any) => v.id)).toEqual([101, 102]);
    expect(variants[1].map((v: any) => v.id)).toEqual([201]);
    expect(variants[2]).toEqual([]);
  });
});
