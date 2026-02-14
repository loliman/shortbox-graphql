import {
  AppearanceInputSchema,
  ArcInputSchema,
  CoverInputSchema,
  DateFilterSchema,
  FeatureInputSchema,
  FilterSchema,
  IndividualInputSchema,
  IssueInputSchema,
  LoginInputSchema,
  NumberFilterSchema,
  PublisherInputSchema,
  SeriesInputSchema,
  StoryInputSchema,
} from '../src/types/schemas';

describe('schemas', () => {
  it('accepts representative valid payloads', () => {
    expect(DateFilterSchema.parse({ date: '2026-02-14', compare: '>=' })).toEqual({
      date: '2026-02-14',
      compare: '>=',
    });
    expect(NumberFilterSchema.parse({ number: '1', compare: '=' })).toEqual({
      number: '1',
      compare: '=',
    });
    expect(PublisherInputSchema.parse({ name: 'Marvel' })).toEqual({ name: 'Marvel' });
    expect(
      SeriesInputSchema.parse({ title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } }),
    ).toMatchObject({ title: 'Spider-Man', volume: 1 });
    expect(
      IssueInputSchema.parse({
        number: '1',
        title: 'Issue 1',
        series: { title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } },
      }),
    ).toMatchObject({ number: '1' });
    expect(IndividualInputSchema.parse({ name: 'Peter Parker' })).toEqual({
      name: 'Peter Parker',
    });
    expect(LoginInputSchema.parse({ name: 'alice', password: 'secret' })).toEqual({
      name: 'alice',
      password: 'secret',
    });
    expect(AppearanceInputSchema.parse({ name: 'Spider-Man', type: 'CHARACTER' })).toMatchObject({
      name: 'Spider-Man',
    });
    expect(ArcInputSchema.parse({ title: 'Civil War', type: 'EVENT' })).toMatchObject({
      title: 'Civil War',
    });
    expect(
      StoryInputSchema.parse({
        number: 1,
        title: 'Start',
        parent: { number: 0, title: 'Prelude' },
      }),
    ).toMatchObject({ number: 1 });
    expect(
      CoverInputSchema.parse({
        number: 1,
        parent: { number: 0 },
      }),
    ).toMatchObject({ number: 1 });
    expect(
      FeatureInputSchema.parse({
        number: 1,
        title: 'Backup Story',
        individuals: [{ name: 'Writer' }],
      }),
    ).toMatchObject({ number: 1 });
    expect(
      FilterSchema.parse({
        us: true,
        publishers: [{ name: 'Marvel' }],
        series: [{ title: 'Spider-Man', volume: 1, publisher: { name: 'Marvel' } }],
      }),
    ).toMatchObject({ us: true });
  });

  it('rejects invalid required fields', () => {
    expect(() => PublisherInputSchema.parse({ name: '' })).toThrow();
    expect(() => SeriesInputSchema.parse({ title: 'X', volume: 0 })).toThrow();
    expect(() => LoginInputSchema.parse({ name: '', password: '' })).toThrow();
    expect(() => IssueInputSchema.parse({ number: '' })).toThrow();
  });
});

