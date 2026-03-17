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
      Publisher: { findOne: jest.fn(), findOrCreate: jest.fn() },
      Series: { findOne: jest.fn(), create: jest.fn() },
      Issue: { findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
      Story: { findAll: jest.fn(), destroy: jest.fn().mockResolvedValue(undefined), create: jest.fn() },
      Cover: { findAll: jest.fn(), findOrCreate: jest.fn() },
      Individual: { findOrCreate: jest.fn() },
      Issue_Individual: { findOrCreate: jest.fn() },
      Cover_Individual: { findOrCreate: jest.fn() },
      Arc: { findOrCreate: jest.fn() },
      Issue_Arc: { findOrCreate: jest.fn() },
      Appearance: { findOrCreate: jest.fn() },
      Story_Appearance: { findOrCreate: jest.fn() },
      Story_Individual: { findOrCreate: jest.fn() },
    };
    mockModels.Publisher.findOrCreate.mockResolvedValue([{ id: 1 }]);
    mockModels.Cover.findOrCreate.mockResolvedValue([{ id: 1, url: '' }]);
    mockModels.Individual.findOrCreate.mockResolvedValue([{ id: 1 }]);
    mockModels.Issue_Individual.findOrCreate.mockResolvedValue([{}]);
    mockModels.Cover_Individual.findOrCreate.mockResolvedValue([{}]);
    mockModels.Arc.findOrCreate.mockResolvedValue([{ id: 1 }]);
    mockModels.Issue_Arc.findOrCreate.mockResolvedValue([{}]);
    mockModels.Appearance.findOrCreate.mockResolvedValue([{ id: 1 }]);
    mockModels.Story_Appearance.findOrCreate.mockResolvedValue([{}]);
    mockModels.Story_Individual.findOrCreate.mockResolvedValue([{}]);
    issueService = new IssueService(mockModels, 'req-1');
    (issueService as any).crawler = {
      crawlSeries: jest.fn(),
      crawlIssue: jest.fn().mockResolvedValue({ collectedIssues: [], containedIssues: [] }),
    };
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
        number: 25,
        title: 'Story',
      }),
      { transaction: tx },
    );
  });

  it('persists story numbers, individuals, and appearances from edited DE stories', async () => {
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
          addinfo: 'Info',
          part: '2/3',
          individuals: [
            { name: 'Writer One', type: ['WRITER', 'PENCILER'] },
            { name: 'Inker One', type: 'INKER' },
          ],
          appearances: [
            { name: 'Spider-Man', type: 'CHARACTER', role: 'lead' },
            { name: 'Mary Jane', type: 'CHARACTER' },
          ],
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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });
    mockModels.Individual.findOrCreate
      .mockResolvedValueOnce([{ id: 101 }])
      .mockResolvedValueOnce([{ id: 102 }]);
    mockModels.Appearance.findOrCreate
      .mockResolvedValueOnce([{ id: 201 }])
      .mockResolvedValueOnce([{ id: 202 }]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: null,
        number: 25,
        title: 'Story',
        addinfo: 'Info',
        part: '2/3',
      }),
      { transaction: tx },
    );
    expect(mockModels.Story_Individual.findOrCreate).toHaveBeenCalledTimes(3);
    expect(mockModels.Story_Individual.findOrCreate).toHaveBeenNthCalledWith(1, {
      where: {
        fk_story: 999,
        fk_individual: 101,
        type: 'WRITER',
      },
      defaults: {
        fk_story: 999,
        fk_individual: 101,
        type: 'WRITER',
      },
      transaction: tx,
    });
    expect(mockModels.Story_Individual.findOrCreate).toHaveBeenNthCalledWith(2, {
      where: {
        fk_story: 999,
        fk_individual: 101,
        type: 'PENCILER',
      },
      defaults: {
        fk_story: 999,
        fk_individual: 101,
        type: 'PENCILER',
      },
      transaction: tx,
    });
    expect(mockModels.Story_Individual.findOrCreate).toHaveBeenNthCalledWith(3, {
      where: {
        fk_story: 999,
        fk_individual: 102,
        type: 'INKER',
      },
      defaults: {
        fk_story: 999,
        fk_individual: 102,
        type: 'INKER',
      },
      transaction: tx,
    });
    expect(mockModels.Story_Appearance.findOrCreate).toHaveBeenCalledTimes(2);
    expect(mockModels.Story_Appearance.findOrCreate).toHaveBeenNthCalledWith(1, {
      where: {
        fk_story: 999,
        fk_appearance: 201,
        role: 'lead',
      },
      defaults: {
        fk_story: 999,
        fk_appearance: 201,
        role: 'lead',
      },
      transaction: tx,
    });
    expect(mockModels.Story_Appearance.findOrCreate).toHaveBeenNthCalledWith(2, {
      where: {
        fk_story: 999,
        fk_appearance: 202,
        role: '',
      },
      defaults: {
        fk_story: 999,
        fk_appearance: 202,
        role: '',
      },
      transaction: tx,
    });
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
        number: 25,
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

  it('imports contained issues instead of the TPB parent issue when the crawler resolves a gallery', async () => {
    mockModels.Series.findOne.mockImplementation(({ where }: any) => {
      if (where?.title === 'Star Wars: The Original Marvel Years Omnibus' && where?.volume === 1) return { id: 77 };
      if (where?.title === 'Star Wars' && where?.volume === 1) return { id: 99 };
      return null;
    });
    mockModels.Issue.findOne.mockImplementation(({ where }: any) => {
      if (where?.number === '2' && where?.fk_series === 77) return null;
      if (where?.number === '1' && where?.fk_series === 99) return null;
      if (where?.number === '2' && where?.fk_series === 99) return null;
      return null;
    });
    mockModels.Issue.create
      .mockResolvedValueOnce({ id: 500, format: 'Heft' })
      .mockResolvedValueOnce({ id: 501, format: 'Heft' });

    (issueService as any).crawler = {
      crawlSeries: jest.fn().mockImplementation(async (title: string, volume: number) => ({
        title,
        volume,
        startyear: 1977,
        endyear: 0,
        publisherName: 'Marvel Comics',
      })),
      crawlIssue: jest.fn().mockImplementation(async (title: string, volume: number, number: string) => {
        if (title === 'Star Wars: The Original Marvel Years Omnibus' && volume === 1 && number === '2') {
          return {
            releasedate: '2022-01-01',
            legacyNumber: '',
            price: 100,
            currency: 'USD',
            cover: { number: 0, url: '', individuals: [] },
            stories: [],
            individuals: [],
            arcs: [],
            variants: [],
            containedIssues: [
              { number: '1', storyTitle: 'TPB Story Part 1', series: { title: 'Star Wars', volume: 1 } },
              { number: '2', storyTitle: 'TPB Story Part 2', series: { title: 'Star Wars', volume: 1 } },
            ],
          };
        }

        return {
          releasedate: '1977-07-01',
          legacyNumber: '',
          price: 0.35,
          currency: 'USD',
          cover: { number: 0, url: '', individuals: [] },
          stories: [],
          individuals: [],
          arcs: [],
          variants: [],
        };
      }),
    };

    const parentIssueIds = await (issueService as any).findOrCrawlParentIssues(
      {
        title: 'Star Wars: The Original Marvel Years Omnibus',
        volume: 1,
        number: '2',
      },
      tx,
    );

    expect(parentIssueIds).toEqual([
      { issueId: 500, storyTitle: 'TPB Story Part 1' },
      { issueId: 501, storyTitle: 'TPB Story Part 2' },
    ]);
    expect(mockModels.Issue.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        number: '1',
        fk_series: 99,
      }),
      { transaction: tx },
    );
    expect(mockModels.Issue.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        number: '2',
        fk_series: 99,
      }),
      { transaction: tx },
    );
    expect(mockModels.Issue.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        number: '2',
        price: 100,
      }),
      { transaction: tx },
    );
  });

  it('keeps contained issue story titles from TPB gallery entries', async () => {
    mockModels.Series.findOne.mockImplementation(({ where }: any) => {
      if (where?.title === 'Doctor Strange Omnibus' && where?.volume === 1) return { id: 77 };
      if (where?.title === 'Strange Tales' && where?.volume === 1) return { id: 99 };
      return null;
    });
    mockModels.Issue.findOne.mockImplementation(({ where }: any) => {
      if (where?.number === '1' && where?.fk_series === 77) return null;
      if (where?.number === '110' && where?.fk_series === 99) return null;
      return null;
    });
    mockModels.Issue.create.mockResolvedValueOnce({ id: 500, format: 'Heft' });
    mockModels.Story.create.mockResolvedValue({ id: 900 });

    (issueService as any).crawler = {
      crawlSeries: jest.fn().mockImplementation(async (title: string, volume: number) => ({
        title,
        volume,
        startyear: 1963,
        endyear: 1968,
        publisherName: 'Marvel Comics',
      })),
      crawlIssue: jest.fn().mockImplementation(async (title: string, volume: number, number: string) => {
        if (title === 'Doctor Strange Omnibus' && volume === 1 && number === '1') {
          return {
            releasedate: '2016-10-04',
            legacyNumber: '',
            price: 75,
            currency: 'USD',
            cover: { number: 0, url: '', individuals: [] },
            stories: [],
            individuals: [],
            arcs: [],
            variants: [],
            containedIssues: [
              {
                number: '110',
                storyTitle: 'Dr. Strange Master of Black Magic!',
                series: { title: 'Strange Tales', volume: 1 },
              },
            ],
          };
        }

        return {
          releasedate: '1963-07-01',
          legacyNumber: '',
          price: 0.12,
          currency: 'USD',
          cover: { number: 0, url: '', individuals: [] },
          stories: [
            { number: 1, title: 'The Human Torch Vs. the Wizard and Paste-Pot Pete!' },
            { number: 2, title: 'Dr. Strange' },
          ],
          individuals: [],
          arcs: [],
          variants: [],
        };
      }),
    };

    const parentIssueIds = await (issueService as any).findOrCrawlParentIssues(
      {
        title: 'Doctor Strange Omnibus',
        volume: 1,
        number: '1',
      },
      tx,
    );

    expect(parentIssueIds).toEqual([
      { issueId: 500, storyTitle: 'Dr. Strange Master of Black Magic!' },
    ]);
  });

  it('links all parent stories from resolved contained issues when no parent story number is provided', async () => {
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
          title: 'TPB Story Part 2',
          addinfo: '',
          part: '',
          parent: {
            issue: {
              series: { title: 'Star Wars: The Original Marvel Years Omnibus', volume: 1 },
              number: '2',
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
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll
      .mockResolvedValueOnce([{ id: 901, number: 25, fk_parent: 902 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 777, fk_issue: 500, number: 1, title: 'TPB Story Part 1' },
        { id: 778, fk_issue: 501, number: 1, title: 'TPB Story Part 2' },
      ]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    jest.spyOn(issueService as any, 'findOrCrawlParentIssues').mockResolvedValue([
      { issueId: 500, storyTitle: 'TPB Story Part 1' },
      { issueId: 501, storyTitle: 'TPB Story Part 2' },
    ]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.findAll).toHaveBeenNthCalledWith(3, {
      where: { fk_issue: { [Op.in]: [500, 501] } },
      order: [
        ['fk_issue', 'ASC'],
        ['number', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction: tx,
    });
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 778,
        number: 1,
        title: 'TPB Story Part 2',
      }),
      { transaction: tx },
    );
  });

  it('matches TPB references to the specific parent story instead of all stories from the resolved issue', async () => {
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
          title: 'Wanted Story',
          addinfo: '',
          part: '',
          parent: {
            issue: {
              series: { title: 'Star Wars: The Original Marvel Years Omnibus', volume: 1 },
              number: '2',
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
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll
      .mockResolvedValueOnce([{ id: 901, number: 25, fk_parent: 902 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 777, fk_issue: 501, number: 1, title: 'Other Story' },
        { id: 778, fk_issue: 501, number: 2, title: 'Wanted Story' },
      ]);
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    jest.spyOn(issueService as any, 'findOrCrawlParentIssues').mockResolvedValue([
      { issueId: 501, storyTitle: 'Wanted Story' },
    ]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledTimes(1);
    expect(mockModels.Story.create).toHaveBeenCalledWith(
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 778,
        title: 'Wanted Story',
      }),
      { transaction: tx },
    );
  });

  it('attaches the resolved omnibus stories when the input story title is empty', async () => {
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
          title: '',
          addinfo: '',
          part: '',
          parent: {
            issue: {
              series: { title: 'Doctor Strange Omnibus', volume: 1 },
              number: '1',
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
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll.mockImplementation(({ where }: any) => {
      if (where?.fk_issue === 211) return [{ id: 901, number: 25, fk_parent: 902 }];
      if (where?.id && where.id[Op.in]) return [];
      if (where?.fk_issue === 500 || where?.fk_issue?.[Op.in]?.includes?.(500)) {
        return [
          { id: 579, fk_issue: 500, number: 1, title: 'The Human Torch Vs. the Wizard and Paste-Pot Pete!' },
          { id: 582, fk_issue: 500, number: 4, title: 'Dr. Strange Master of Black Magic!' },
        ];
      }
      return [];
    });
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    (issueService as any).crawler.crawlIssue = jest.fn().mockResolvedValue({
      collectedIssues: [
        {
          number: '110',
          storyTitle: 'The Human Torch Vs. the Wizard and Paste-Pot Pete!',
          series: { title: 'Strange Tales', volume: 1 },
        },
        {
          number: '110',
          storyTitle: 'Dr. Strange Master of Black Magic!',
          series: { title: 'Strange Tales', volume: 1 },
        },
      ],
    });

    jest.spyOn(issueService as any, 'findOrCrawlParentIssues').mockImplementation(async (parent: any) => {
      expect(parent).toEqual({
        title: 'Strange Tales',
        volume: 1,
        number: '110',
      });
      return [
        { issueId: 500, storyTitle: 'The Human Torch Vs. the Wizard and Paste-Pot Pete!' },
        { issueId: 500, storyTitle: 'Dr. Strange Master of Black Magic!' },
      ];
    });

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledTimes(2);
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 579,
        title: '',
      }),
      { transaction: tx },
    );
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 582,
        title: '',
      }),
      { transaction: tx },
    );
  });

  it('attaches all stories from an expanded TPB issue even when parent refs only contain issue ids', async () => {
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
          title: '',
          addinfo: '',
          part: '',
          parent: {
            issue: {
              series: { title: 'Doctor Strange Omnibus', volume: 1 },
              number: '1',
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
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll.mockImplementation(({ where }: any) => {
      if (where?.fk_issue === 211) return [{ id: 901, number: 25, fk_parent: 902 }];
      if (where?.id && where.id[Op.in]) return [];
      if (where?.fk_issue === 500 || where?.fk_issue?.[Op.in]?.includes?.(500)) {
        return [
          { id: 579, fk_issue: 500, number: 1, title: 'The Human Torch Vs. the Wizard and Paste-Pot Pete!' },
          { id: 582, fk_issue: 500, number: 4, title: 'Dr. Strange Master of Black Magic!' },
        ];
      }
      return [];
    });
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    (issueService as any).crawler.crawlIssue = jest.fn().mockResolvedValue({
      collectedIssues: [
        {
          number: '110',
          storyTitle: 'Dr. Strange Master of Black Magic!',
          series: { title: 'Strange Tales', volume: 1 },
        },
      ],
    });

    jest.spyOn(issueService as any, 'findOrCrawlParentIssues').mockResolvedValue([
      { issueId: 500 },
    ]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledTimes(2);
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 579,
        title: '',
      }),
      { transaction: tx },
    );
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 582,
        title: '',
      }),
      { transaction: tx },
    );
  });

  it('treats a TPB without collected issues like a normal parent issue', async () => {
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
          title: '',
          addinfo: '',
          part: '',
          parent: {
            issue: {
              series: { title: 'Galleryless TPB', volume: 1 },
              number: '1',
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
      .mockResolvedValueOnce({ id: 7 });
    mockModels.Issue.findOne.mockResolvedValueOnce(existing);
    mockModels.Issue.findAll.mockResolvedValueOnce([]);
    mockModels.Story.findAll.mockImplementation(({ where }: any) => {
      if (where?.fk_issue === 211) return [{ id: 901, number: 25, fk_parent: 902 }];
      if (where?.id && where.id[Op.in]) return [];
      if (where?.fk_issue === 700 || where?.fk_issue?.[Op.in]?.includes?.(700)) {
        return [
          { id: 701, fk_issue: 700, number: 1, title: 'Story One' },
          { id: 702, fk_issue: 700, number: 2, title: 'Story Two' },
        ];
      }
      return [];
    });
    mockModels.Story.create = jest.fn().mockResolvedValue({ id: 999 });

    (issueService as any).crawler.crawlIssue = jest.fn().mockResolvedValue({
      collectedIssues: [],
      containedIssues: [],
    });

    jest.spyOn(issueService as any, 'findOrCrawlParentIssues').mockResolvedValue([
      { issueId: 700 },
    ]);

    await issueService.editIssue(oldItem, newItem, tx);

    expect(mockModels.Story.create).toHaveBeenCalledTimes(2);
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 701,
        title: '',
      }),
      { transaction: tx },
    );
    expect(mockModels.Story.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fk_issue: 211,
        fk_parent: 702,
        title: '',
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
