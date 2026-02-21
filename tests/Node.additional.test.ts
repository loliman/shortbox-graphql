const mockModels = {
  Publisher: { findAll: jest.fn() },
  Series: { findAll: jest.fn() },
  Issue: { findAll: jest.fn() },
};

jest.mock('../src/models', () => ({
  __esModule: true,
  default: mockModels,
}));

import { resolvers } from '../src/api/Node';

describe('Node API resolver additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array for blank pattern', async () => {
    await expect(
      resolvers.Query.nodes({}, { pattern: '   ', us: true, offset: 0 } as any),
    ).resolves.toEqual([]);
  });

  it('builds publisher/series/issue nodes, sorts and applies offset', async () => {
    mockModels.Publisher.findAll.mockResolvedValue([{ name: 'Spider-Verse Press' }]);
    mockModels.Series.findAll.mockResolvedValue([
      {
        title: 'Spider-Man',
        volume: 2,
        startyear: 2020,
        endyear: 2024,
        publisher: { name: 'Marvel Comics' },
      },
    ]);
    mockModels.Issue.findAll.mockResolvedValue([
      {
        title: 'Beyond',
        number: '1',
        format: 'Heft',
        variant: 'B',
        series: {
          title: 'Spider-Man',
          volume: 2,
          startyear: 2020,
          endyear: 2024,
          publisher: { name: 'Marvel Comics' },
        },
      },
    ]);

    const all = await resolvers.Query.nodes({}, { pattern: 'spider', us: true, offset: 0 } as any);
    const sliced = await resolvers.Query.nodes({}, {
      pattern: 'spider',
      us: true,
      offset: 1,
    } as any);

    expect(all).toHaveLength(3);
    expect(all[0].url.startsWith('/us/')).toBe(true);
    expect(all.some((n) => n.type === 'series')).toBe(true);
    expect(all.some((n) => n.type === 'issue')).toBe(true);
    expect(sliced).toHaveLength(2);

    expect(mockModels.Publisher.findAll).toHaveBeenCalled();
    expect(mockModels.Series.findAll).toHaveBeenCalled();
    expect(mockModels.Issue.findAll).toHaveBeenCalled();
  });

  it('returns null-safe values from Node field resolvers', () => {
    expect(resolvers.Node.type({ type: 'issue' } as any, {} as any, {} as any, {} as any)).toBe(
      'issue',
    );
    expect(resolvers.Node.label({} as any, {} as any, {} as any, {} as any)).toBeNull();
    expect(resolvers.Node.url({} as any, {} as any, {} as any, {} as any)).toBeNull();
  });
});
