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
        create: jest.fn(),
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

    const result = await issueService.getLastEdited(undefined, 1, undefined, undefined, undefined, false);

    expect(result.edges.length).toBe(1);
    expect(mockModels.Issue.findAll).toHaveBeenCalledWith(expect.objectContaining({
      limit: 2,
      order: [['updatedAt', 'DESC'], ['id', 'DESC']]
    }));
  });
});
