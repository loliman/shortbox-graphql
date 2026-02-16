import { Op } from 'sequelize';
import logger from '../src/util/logger';

const mockGetFilterOptions = jest.fn();

jest.mock('../src/services/FilterService', () => ({
  FilterService: jest.fn().mockImplementation(() => ({
    getFilterOptions: mockGetFilterOptions,
  })),
}));

import { IssueService } from '../src/services/IssueService';

describe('IssueService additional coverage', () => {
  let issueService: IssueService;
  let mockModels: any;
  const tx = {} as any;
  const baseItem = {
    title: '  Title ',
    number: ' 1 ',
    variant: ' A ',
    format: 'HC',
    releasedate: '2026-01-01',
    pages: 44,
    price: 4.5,
    currency: 'USD',
    isbn: 'isbn',
    limitation: '1000',
    addinfo: 'info',
    series: {
      title: '  Series ',
      volume: 1,
      publisher: { name: '  Pub ' },
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockModels = {
      Publisher: { findOne: jest.fn() },
      Series: { findOne: jest.fn() },
      Issue: { findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
      Story: { findAll: jest.fn() },
      Cover: { findAll: jest.fn() },
      Feature: { findAll: jest.fn() },
    };
    issueService = new IssueService(mockModels, 'req-1');
  });

  it('uses FilterService options in filtered findIssues without cursor pagination', async () => {
    const cursor = Buffer.from('55').toString('base64');
    mockGetFilterOptions.mockReturnValue({ where: {}, order: [['id', 'ASC']] });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.findIssues(undefined, baseItem.series, 5, cursor, true, { us: true } as any);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    const andKey = Object.getOwnPropertySymbols(options.where).find((k) =>
      String(k).includes('and'),
    );
    expect(andKey).toBeUndefined();
  });

  it('applies pattern filter in non-filtered findIssues query options', async () => {
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.findIssues('12', baseItem.series, undefined, undefined, false, undefined);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    const orKey = Object.getOwnPropertySymbols(options.where).find((k) =>
      String(k).includes('or'),
    );
    expect(orKey).toBeDefined();
    expect(Array.isArray(options.where[orKey!])).toBe(true);
  });

  it('sorts filtered findIssues by number, then variant, then id', async () => {
    mockGetFilterOptions.mockReturnValue({ where: {}, order: [['id', 'ASC']] });
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 2, number: '1', variant: 'B' },
      { id: 3, number: '1', variant: 'A' },
      { id: 1, number: '1', variant: 'A' },
    ]);

    const result = await issueService.findIssues(undefined, baseItem.series, undefined, undefined, true, {
      us: true,
    } as any);
    const ids = result.edges.map((edge: any) => edge.node.id);

    expect(ids).toEqual([1, 3, 2]);
  });

  it('deduplicates filtered findIssues results by series and number', async () => {
    mockGetFilterOptions.mockReturnValue({ where: {}, order: [['id', 'ASC']] });
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 11, fk_series: 9, number: '1', variant: 'B' },
      { id: 10, fk_series: 9, number: '1', variant: '' },
      { id: 12, fk_series: 9, number: '2', variant: '' },
    ]);

    const result = await issueService.findIssues(undefined, baseItem.series, undefined, undefined, true, {
      us: true,
    } as any);

    expect(result.edges.map((edge: any) => edge.node.id)).toEqual([10, 12]);
  });

  it('handles CRUD error paths and success paths', async () => {
    await expect(issueService.deleteIssue(baseItem, tx)).rejects.toThrow('Publisher not found');
    mockModels.Publisher.findOne.mockResolvedValue({ id: 3 });

    await expect(issueService.deleteIssue(baseItem, tx)).rejects.toThrow('Series not found');
    mockModels.Series.findOne.mockResolvedValue({ id: 7 });

    await expect(issueService.deleteIssue(baseItem, tx)).rejects.toThrow('Issue not found');
    const deleteInstance = jest.fn().mockResolvedValue(true);
    mockModels.Issue.findOne.mockResolvedValue({ deleteInstance });
    await expect(issueService.deleteIssue(baseItem, tx)).resolves.toBe(true);
    expect(deleteInstance).toHaveBeenCalledWith(tx, mockModels);

    mockModels.Publisher.findOne.mockResolvedValue(null);
    await expect(issueService.createIssue(baseItem, tx)).rejects.toThrow('Publisher not found');
    mockModels.Publisher.findOne.mockResolvedValue({ id: 4 });
    mockModels.Series.findOne.mockResolvedValue(null);
    await expect(issueService.createIssue(baseItem, tx)).rejects.toThrow('Series not found');
    mockModels.Series.findOne.mockResolvedValue({ id: 8 });
    mockModels.Issue.create.mockResolvedValue({ id: 99 });
    await issueService.createIssue(baseItem, tx);
    expect(mockModels.Issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Title',
        number: '1',
        variant: 'A',
        fk_series: 8,
      }),
      { transaction: tx },
    );

    mockModels.Publisher.findOne.mockResolvedValue(null);
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow('Publisher not found');
    mockModels.Publisher.findOne.mockResolvedValue({ id: 4 });
    mockModels.Series.findOne.mockResolvedValue(null);
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow('Series not found');
    mockModels.Series.findOne.mockResolvedValue({ id: 8 });
    mockModels.Issue.findOne.mockResolvedValue(null);
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow('Issue not found');

    const save = jest.fn().mockResolvedValue({ id: 111 });
    const existing = { save } as any;
    mockModels.Issue.findOne.mockResolvedValue(existing);
    await issueService.editIssue(baseItem, baseItem, tx);
    expect(existing.title).toBe('Title');
    expect(existing.number).toBe('1');
    expect(existing.variant).toBe('A');
    expect(save).toHaveBeenCalledWith({ transaction: tx });
  });

  it('applies lastEdited filter mapping and cursor fallback for null cursor value', async () => {
    const cursor = Buffer.from('88').toString('base64');
    mockModels.Issue.findByPk.mockResolvedValue({ get: jest.fn().mockReturnValue(null) });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.getLastEdited(
      {
        us: false,
        publishers: [{ name: 'Marvel' }],
        series: [{ title: 'Spider-Man', volume: 2 }],
      } as any,
      10,
      cursor,
      'title',
      'ASC',
      true,
    );

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.order).toEqual([
      ['title', 'ASC'],
      ['id', 'ASC'],
    ]);

    const andKey = Object.getOwnPropertySymbols(options.where).find((k) =>
      String(k).includes('and'),
    );
    expect(andKey).toBeDefined();
    const andEntries = options.where[andKey!] as Array<Record<string | symbol, unknown>>;
    expect(andEntries[0]).toEqual({ id: { [Op.gt]: 88 } });

    const seriesInclude = options.include[0];
    const publisherInclude = seriesInclude.include[0];
    expect(publisherInclude.where).toEqual({ original: false, name: 'Marvel' });
    expect(seriesInclude.where).toEqual({ title: 'Spider-Man', volume: 2 });
  });

  it('maps ids in getIssuesByIds and returns empty variants for empty keys', async () => {
    mockModels.Issue.findAll.mockResolvedValue([{ id: 1 }, { id: 3 }]);
    await expect(issueService.getIssuesByIds([1, 2, 3])).resolves.toEqual([
      { id: 1 },
      null,
      { id: 3 },
    ]);
    await expect(issueService.getVariantsBySeriesAndNumberKeys([])).resolves.toEqual([]);
  });

  it('emits warn/error log levels via private logger helper', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger as any);
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger as any);

    (issueService as any).log('warn test', 'warn');
    (issueService as any).log('error test', 'error');

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
