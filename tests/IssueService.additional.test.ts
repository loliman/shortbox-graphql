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
      Story: { findAll: jest.fn(), destroy: jest.fn().mockResolvedValue(undefined) },
      Cover: { findAll: jest.fn() },
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
    const orKey = Object.getOwnPropertySymbols(options.where).find((k) => String(k).includes('or'));
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

    const result = await issueService.findIssues(
      undefined,
      baseItem.series,
      undefined,
      undefined,
      true,
      {
        us: true,
      } as any,
    );
    const ids = result.edges.map((edge: any) => edge.node.id);

    expect(ids).toEqual([1, 3, 2]);
  });

  it('keeps series context in filtered findIssues path', async () => {
    mockGetFilterOptions.mockReturnValue({ where: {}, order: [['id', 'ASC']] });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.findIssues('12', baseItem.series, undefined, undefined, true, {
      us: true,
      publishers: [{ name: 'Marvel' }],
    } as any);

    const options = mockModels.Issue.findAll.mock.calls[0][0];
    expect(options.where['$series.title$']).toBe('Series');
    expect(options.where['$series.volume$']).toBe(1);
    expect(options.where['$series.publisher.name$']).toBe('Pub');

    const andKey = Object.getOwnPropertySymbols(options.where).find((k) =>
      String(k).includes('and'),
    );
    expect(andKey).toBeDefined();
  });

  it('deduplicates filtered findIssues results by series and number', async () => {
    mockGetFilterOptions.mockReturnValue({ where: {}, order: [['id', 'ASC']] });
    mockModels.Issue.findAll.mockResolvedValue([
      { id: 11, fk_series: 9, number: '1', variant: 'B' },
      { id: 10, fk_series: 9, number: '1', variant: '' },
      { id: 12, fk_series: 9, number: '2', variant: '' },
    ]);

    const result = await issueService.findIssues(
      undefined,
      baseItem.series,
      undefined,
      undefined,
      true,
      {
        us: true,
      } as any,
    );

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
    expect(mockModels.Issue.findOne).toHaveBeenLastCalledWith({
      where: {
        number: '1',
        variant: 'A',
        format: 'HC',
        fk_series: 7,
      },
      transaction: tx,
    });
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
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow(
      'Publisher not found',
    );
    mockModels.Publisher.findOne.mockResolvedValue({ id: 4 });
    mockModels.Series.findOne.mockResolvedValue(null);
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow(
      'Series not found',
    );
    mockModels.Series.findOne.mockResolvedValue({ id: 8 });
    mockModels.Issue.findOne.mockResolvedValue(null);
    await expect(issueService.editIssue(baseItem, baseItem, tx)).rejects.toThrow('Issue not found');

    const save = jest.fn().mockResolvedValue({ id: 111 });
    const existing = { save } as any;
    mockModels.Issue.findOne.mockResolvedValue(existing);
    await issueService.editIssue(baseItem, baseItem, tx);
    expect(mockModels.Issue.findOne).toHaveBeenLastCalledWith({
      where: {
        number: '1',
        variant: 'A',
        format: 'HC',
        fk_series: 8,
      },
      transaction: tx,
    });
    expect(existing.title).toBe('Title');
    expect(existing.number).toBe('1');
    expect(existing.variant).toBe('A');
    expect(save).toHaveBeenCalledWith({ transaction: tx });
  });

  it('uses format to disambiguate duplicate issues during edit', async () => {
    const oldItem = {
      ...baseItem,
      number: ' 1 ',
      variant: '',
      format: ' Hardcover ',
      series: {
        title: ' Series ',
        volume: 1,
        publisher: { name: ' Pub ' },
      },
    } as any;
    const newItem = {
      ...oldItem,
      format: 'Softcover',
    } as any;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: false })
      .mockResolvedValueOnce({ id: 3, original: false });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll.mockResolvedValueOnce([]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Issue.findOne).toHaveBeenCalledWith({
      where: {
        number: '1',
        variant: '',
        format: 'Hardcover',
        fk_series: 7,
      },
      transaction: tx,
    });
    expect(existing.format).toBe('Softcover');
    expect(save).toHaveBeenCalledWith({ transaction: tx });
  });

  it('does not touch stories for DE status-only edits without stories payload', async () => {
    const oldItem = {
      ...baseItem,
      collected: false,
      series: {
        title: 'Series',
        volume: 1,
        publisher: { name: 'Pub' },
      },
    } as any;
    const newItem = {
      ...oldItem,
      collected: true,
    } as any;
    delete newItem.stories;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: false })
      .mockResolvedValueOnce({ id: 3, original: false });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(existing.collected).toBe(true);
    expect(save).toHaveBeenCalledWith({ transaction: tx });
    expect(mockModels.Story.destroy).not.toHaveBeenCalled();
    expect(mockModels.Story.findAll).not.toHaveBeenCalled();
  });

  it('clears parent links when edited stories omit parent references', async () => {
    const oldItem = {
      ...baseItem,
      number: '1',
      variant: '',
      format: 'Hardcover',
      stories: [{ number: 25 }],
      series: {
        title: 'Series',
        volume: 1,
        publisher: { name: 'Pub' },
      },
    } as any;
    const newItem = {
      ...oldItem,
      stories: [
        {
          number: 25,
          title: 'Story',
          addinfo: '',
          part: '',
        },
      ],
    } as any;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: false })
      .mockResolvedValueOnce({ id: 3, original: false });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll
      .mockResolvedValueOnce([{ id: 901, number: 25, fk_parent: 902 }])
      .mockResolvedValueOnce([]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: null,
        number: 1,
        title: 'Story',
      }),
      { transaction: tx },
    );
  });

  it('resolves US parent stories against the main issue with empty variant', async () => {
    const oldItem = {
      ...baseItem,
      number: '1',
      variant: '',
      format: 'Hardcover',
      series: {
        title: 'Series',
        volume: 1,
        publisher: { name: 'Pub' },
      },
    } as any;
    const newItem = {
      ...oldItem,
      stories: [
        {
          number: 25,
          title: 'Story',
          addinfo: '',
          part: '',
          parent: {
            number: 2,
            issue: {
              series: { title: 'Invincible Iron Man', volume: 4 },
              number: '593',
            },
          },
        },
      ],
    } as any;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: false })
      .mockResolvedValueOnce({ id: 3, original: false });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 99 });
    mockModels.Issue.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ id: 500 });
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll
      .mockResolvedValueOnce([{ id: 901, number: 25, fk_parent: 902 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 777, number: 2 }]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Issue.findOne).toHaveBeenNthCalledWith(2, {
      where: {
        number: '593',
        variant: '',
        fk_series: 99,
      },
      transaction: tx,
    });
    expect(mockModels.Story.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 777,
        number: 1,
        title: 'Story',
      }),
      { transaction: tx },
    );
  });

  it('coerces invalid crawled release dates while linking US parent stories', async () => {
    const oldItem = {
      ...baseItem,
      number: '1',
      variant: '',
      format: 'Hardcover',
      series: {
        title: 'Series',
        volume: 1,
        publisher: { name: 'Pub' },
      },
    } as any;
    const newItem = {
      ...oldItem,
      stories: [
        {
          number: 25,
          title: 'Story',
          addinfo: '',
          part: '',
          parent: {
            number: 1,
            issue: {
              series: { title: 'Marvel Super Heroes', volume: 1 },
              number: '12',
            },
          },
        },
      ],
    } as any;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: false })
      .mockResolvedValueOnce({ id: 3, original: false });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce(null);
    mockModels.Series.create = jest.fn().mockResolvedValue({ id: 99 });
    mockModels.Publisher.findOrCreate = jest.fn().mockResolvedValue([{ id: 55 }]);
    mockModels.Issue.findOne
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(null);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Issue.create = jest.fn().mockResolvedValue({ id: 500, format: 'Heft' });
    mockModels.Story.findAll
      .mockResolvedValueOnce([{ id: 901, number: 25, fk_parent: 902 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 777, number: 1 }]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });
    mockModels.Cover.findOrCreate = jest.fn().mockResolvedValue([{ id: 600, url: '' }]);

    (issueService as any).crawler = {
      crawlSeries: jest.fn().mockResolvedValue({
        title: 'Marvel Super Heroes',
        volume: 1,
        startyear: 1967,
        endyear: 0,
        publisherName: 'Marvel Comics',
      }),
      crawlIssue: jest.fn().mockResolvedValue({
        releasedate: 'Invalid date',
        legacyNumber: '',
        price: 0,
        currency: 'USD',
        cover: { number: 0, url: '', individuals: [] },
        stories: [],
        individuals: [],
        arcs: [],
        variants: [],
      }),
    };

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        number: '12',
        fk_series: 99,
        releasedate: '1970-01-01',
      }),
      { transaction: tx },
    );
  });

  it('moves all sibling variants to the new series when the edited issue changes series', async () => {
    const oldItem = {
      ...baseItem,
      number: ' 1 ',
      variant: ' Variant B ',
      series: {
        title: ' Old Series ',
        volume: 1,
        publisher: { name: ' Old Pub ' },
      },
    } as any;
    const newItem = {
      ...baseItem,
      number: ' 1 ',
      variant: ' Variant B ',
      series: {
        title: ' New Series ',
        volume: 2,
        publisher: { name: ' New Pub ' },
      },
    } as any;

    const editedSave = jest.fn().mockResolvedValue({ id: 111 });
    const siblingSave = jest.fn().mockResolvedValue({ id: 112 });
    const editedIssue = { id: 111, save: editedSave } as any;
    const siblingIssue = { id: 112, save: siblingSave, fk_series: 7 } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3 })
      .mockResolvedValueOnce({ id: 4 });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 8 });
    mockModels.Issue.findOne.mockResolvedValueOnce(editedIssue);
    mockModels.Issue.findAll.mockResolvedValueOnce([editedIssue, siblingIssue]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Issue.findAll).toHaveBeenCalledWith({
      where: {
        number: '1',
        fk_series: 7,
      },
      transaction: tx,
    });
    expect(editedIssue.fk_series).toBe(8);
    expect(siblingIssue.fk_series).toBe(8);
    expect(editedSave).toHaveBeenCalledWith({ transaction: tx });
    expect(siblingSave).toHaveBeenCalledWith({ transaction: tx });
  });

  it('does not touch story links when editing a US issue', async () => {
    const oldItem = {
      ...baseItem,
      number: ' 1 ',
      variant: '',
      series: {
        title: ' US Series ',
        volume: 1,
        publisher: { name: ' Marvel Comics ' },
      },
    } as any;
    const newItem = {
      ...baseItem,
      number: ' 1 ',
      variant: '',
      series: {
        title: ' US Series Moved ',
        volume: 2,
        publisher: { name: ' Marvel Comics ' },
      },
    } as any;

    const save = jest.fn().mockResolvedValue({ id: 211 });
    const existing = { id: 211, save } as any;
    const siblingSave = jest.fn().mockResolvedValue({ id: 212 });
    const sibling = { id: 212, save: siblingSave, fk_series: 7 } as any;

    mockModels.Publisher.findOne
      .mockResolvedValueOnce({ id: 3, original: true })
      .mockResolvedValueOnce({ id: 4, original: true });
    mockModels.Series.findOne
      .mockResolvedValueOnce({ id: 7 })
      .mockResolvedValueOnce({ id: 8 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([existing, sibling]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.destroy).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({ transaction: tx });
    expect(siblingSave).toHaveBeenCalledWith({ transaction: tx });
  });

  it('applies lastEdited filter mapping and cursor fallback for null cursor value', async () => {
    const cursor = Buffer.from('88').toString('base64');
    mockGetFilterOptions.mockReturnValue({
      where: {
        [Op.or]: [
          { '$series.publisher.name$': { [Op.in]: ['Marvel'] } },
          { '$series.title$': 'Spider-Man', '$series.volume$': 2 },
        ],
      },
      include: [
        {
          include: [{ where: { original: false } }],
        },
      ],
    });
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
    expect(publisherInclude.where).toEqual({ original: false });

    const orKey = Object.getOwnPropertySymbols(options.where).find((k) => String(k).includes('or'));
    expect(orKey).toBeDefined();
    expect(options.where[orKey!]).toEqual([
      { '$series.publisher.name$': { [Op.in]: ['Marvel'] } },
      { '$series.title$': 'Spider-Man', '$series.volume$': 2 },
    ]);
  });

  it('forces AND semantics for lastEdited when series and publishers are both present', async () => {
    mockGetFilterOptions.mockReturnValue({ where: {}, include: [] });
    mockModels.Issue.findAll.mockResolvedValue([]);

    await issueService.getLastEdited(
      {
        us: false,
        publishers: [{ name: 'Marvel' }],
        series: [{ title: 'Spider-Man', volume: 2 }],
      } as any,
      10,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(mockGetFilterOptions).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        and: true,
        publishers: [{ name: 'Marvel' }],
        series: [{ title: 'Spider-Man', volume: 2 }],
      }),
    );
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
