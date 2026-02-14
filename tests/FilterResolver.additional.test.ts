jest.mock('../src/types/schemas', () => ({
  FilterSchema: {
    parse: jest.fn((value) => value),
  },
}));

import { FilterSchema } from '../src/types/schemas';
import { resolvers } from '../src/api/Filter';

describe('Filter resolver additional coverage', () => {
  it('validates filter and delegates export to service', async () => {
    const exportMock = jest.fn().mockResolvedValue('csv-content');
    const context = {
      loggedIn: true,
      filterService: { export: exportMock },
    } as any;
    const filter = { us: true, formats: ['HC'] };

    const result = await resolvers.Query.export(
      {},
      { filter, type: 'csv' } as any,
      context,
      {} as any,
    );

    expect((FilterSchema.parse as jest.Mock)).toHaveBeenCalledWith(filter);
    expect(exportMock).toHaveBeenCalledWith(filter, 'csv', true);
    expect(result).toBe('csv-content');
  });
});

