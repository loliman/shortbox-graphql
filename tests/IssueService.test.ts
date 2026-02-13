import { IssueService } from '../src/services/IssueService';
import { Op } from 'sequelize';

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
      Feature: {
        findAll: jest.fn(),
      },
      Series: {
        findAll: jest.fn(),
        findOne: jest.fn(),
      },
    };
    issueService = new IssueService(mockModels);
  });

  it('should find issues for a series with cursor pagination', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    const mockIssues = [
      { id: 10, number: '1', variant: '', fk_series: 1 },
      { id: 11, number: '2', variant: '', fk_series: 1 },
    ];
    mockModels.Issue.findAll.mockResolvedValue(mockIssues);

    const result = await issueService.findIssues(undefined, seriesInput, 2, undefined, false, undefined);

    expect(result.edges.length).toBe(2);
    expect(result.edges[0].node.number).toBe('1');
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 3,
      order: [['number', 'ASC'], ['variant', 'ASC'], ['id', 'ASC']]
    }));
  });

  it('should support after cursor', async () => {
    const seriesInput = { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } };
    const cursor = Buffer.from('10').toString('base64');
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.findIssues(undefined, seriesInput, 10, cursor, false, undefined);

    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.anything()
    }));
  });

  it('should handle lastEdited with cursor', async () => {
    mockModels.Issue.findAll.mockResolvedValue([{ id: 100, updatedAt: new Date() }]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    const result = await issueService.getLastEdited(undefined, 1, undefined, undefined, undefined, false);

    expect(result.edges.length).toBe(1);
    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 2,
      order: [['updatedAt', 'DESC'], ['id', 'DESC']]
    }));
  });

  it('should sanitize invalid lastEdited order and direction', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);
    mockModels.Issue.findByPk.mockResolvedValue(null);

    await issueService.getLastEdited(
      undefined,
      10,
      undefined,
      'updatedAt; DROP TABLE Issue; --',
      'desc; DROP TABLE User; --',
      false
    );

    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        order: [['updatedAt', 'DESC'], ['id', 'DESC']],
      })
    );
  });

  it('should build tuple-safe cursor filter for lastEdited', async () => {
    const cursor = Buffer.from('42').toString('base64');
    const cursorDate = new Date('2026-02-12T10:00:00.000Z');

    mockModels.Issue.findByPk.mockResolvedValue({
      get: (field: string) => (field === 'updatedAt' ? cursorDate : undefined),
    });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.getLastEdited(undefined, 10, cursor, 'updatedAt', 'DESC', false);

    const callArgs = mockModels.Issue.findAll.mock.calls[0][0];
    expect(callArgs.order).toEqual([['updatedAt', 'DESC'], ['id', 'DESC']]);

    const andKey = Object.getOwnPropertySymbols(callArgs.where).find((key) =>
      String(key).includes('and')
    );
    expect(andKey).toBeDefined();
    expect(Array.isArray(callArgs.where[andKey!])).toBe(true);
  });

  it('should batch stories/covers/features by issue ids', async () => {
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
    mockModels.Feature.findAll.mockResolvedValue([
      { id: 7, fk_issue: 11, number: 1 },
      { id: 8, fk_issue: 10, number: 1 },
    ]);

    const stories = await issueService.getStoriesByIssueIds([10, 11]);
    const primaryCovers = await issueService.getPrimaryCoversByIssueIds([10, 11, 12]);
    const allCovers = await issueService.getCoversByIssueIds([10, 11]);
    const features = await issueService.getFeaturesByIssueIds([10, 11]);

    expect(stories).toHaveLength(2);
    expect(stories[0].map((s: any) => s.id)).toEqual([1, 3]);
    expect(stories[1].map((s: any) => s.id)).toEqual([2]);

    expect(primaryCovers[0]?.id).toBe(4);
    expect(primaryCovers[1]?.id).toBe(6);
    expect(primaryCovers[2]).toBeNull();

    expect(allCovers[0].map((c: any) => c.id)).toEqual([4, 5]);
    expect(allCovers[1].map((c: any) => c.id)).toEqual([6]);

    expect(features[0].map((f: any) => f.id)).toEqual([8]);
    expect(features[1].map((f: any) => f.id)).toEqual([7]);
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
