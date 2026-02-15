import { asyncForEach, generateLabel } from '../src/util/util';

describe('util generateLabel and asyncForEach', () => {
  it('returns an empty label for nullish values', async () => {
    await expect(generateLabel(undefined)).resolves.toBe('');
    await expect(generateLabel(null)).resolves.toBe('');
  });

  it('prefers the direct publisher name when present', async () => {
    await expect(generateLabel({ name: 'Marvel' })).resolves.toBe('Marvel');
  });

  it('builds a series label with matching start/end year and inline publisher', async () => {
    await expect(
      generateLabel({
        title: 'Amazing Spider-Man',
        volume: 1,
        startyear: 1963,
        endyear: 1963,
        publisher: { name: 'Marvel' },
      }),
    ).resolves.toBe('Amazing Spider-Man (Vol. I) (1963) (Marvel)');
  });

  it('builds a series label with open-ended year and async publisher lookup', async () => {
    const getPublisher = jest.fn().mockResolvedValue({ name: 'DC' });

    await expect(
      generateLabel({
        title: 'Batman',
        volume: 2,
        startyear: 2018,
        endyear: 0,
        getPublisher,
      }),
    ).resolves.toBe('Batman (Vol. II) (2018 - ...) (DC)');

    expect(getPublisher).toHaveBeenCalledTimes(1);
  });

  it('builds an issue label with series, volume, year range and format info', async () => {
    await expect(
      generateLabel({
        number: '1',
        format: 'HC',
        variant: 'Sketch',
        series: {
          title: 'X-Men',
          volume: 2,
          startyear: 1991,
          endyear: 2001,
          publisher: { name: 'Marvel' },
        },
      }),
    ).resolves.toBe('X-Men (Marvel) (Vol. II) (1991 - 2001) #1 (HC/Sketch)');
  });

  it('builds an issue label via async series/publisher loading', async () => {
    const getPublisher = jest.fn().mockResolvedValue({ name: 'Image' });
    const getSeries = jest.fn().mockResolvedValue({
      title: 'Saga',
      volume: 1,
      startyear: 2012,
      endyear: 0,
      getPublisher,
    });

    await expect(
      generateLabel({
        number: '7',
        variant: 'Foil',
        getSeries,
      }),
    ).resolves.toBe('Saga (Image) (Vol. I) (2012 - ...) #7 (Foil)');

    expect(getSeries).toHaveBeenCalledTimes(1);
    expect(getPublisher).toHaveBeenCalledTimes(1);
  });

  it('returns an empty label for issue data without a resolvable series', async () => {
    await expect(
      generateLabel({
        number: '3',
      }),
    ).resolves.toBe('');
  });

  it('executes asyncForEach sequentially', async () => {
    const order: string[] = [];
    const source = [1, 2, 3];

    await asyncForEach(source, async (value, index, array) => {
      order.push(`start-${value}`);
      expect(index).toBe(value - 1);
      expect(array).toBe(source);
      await Promise.resolve();
      order.push(`end-${value}`);
    });

    expect(order).toEqual([
      'start-1',
      'end-1',
      'start-2',
      'end-2',
      'start-3',
      'end-3',
    ]);
  });
});
