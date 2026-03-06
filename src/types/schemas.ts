import { z } from 'zod';

export const DateFilterSchema = z.object({
  date: z.string().or(z.date()),
  compare: z.string(),
});

export const NumberFilterSchema = z.object({
  number: z.string(),
  compare: z.string(),
  variant: z.string().optional(),
});

export const PublisherInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name ist erforderlich'),
  us: z.boolean().optional(),
  addinfo: z.string().optional(),
  startyear: z.number().optional(),
  endyear: z.number().optional().nullable(),
});

const PublisherFilterInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  us: z.boolean().optional(),
  addinfo: z.string().optional(),
  startyear: z.number().optional(),
  endyear: z.number().optional().nullable(),
});

export const SeriesInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Titel ist erforderlich'),
  startyear: z.number().optional(),
  endyear: z.number().optional().nullable(),
  volume: z.number().int().min(1, 'Volume muss mindestens 1 sein'),
  genre: z.string().optional(),
  addinfo: z.string().optional(),
  publisher: PublisherInputSchema.optional(),
});

const SeriesFilterInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  startyear: z.number().optional(),
  endyear: z.number().optional().nullable(),
  volume: z.number().int().optional(),
  genre: z.string().optional(),
  addinfo: z.string().optional(),
  publisher: PublisherFilterInputSchema.optional(),
});

export const IssueInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  number: z.string().min(1, 'Nummer ist erforderlich'),
  format: z.string().optional(),
  variant: z.string().optional(),
  releasedate: z.string().or(z.date()).optional().nullable(),
  legacy_number: z.string().optional(),
  pages: z.number().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  isbn: z.string().optional(),
  limitation: z.string().optional(),
  addinfo: z.string().optional(),
  verified: z.boolean().optional(),
  collected: z.boolean().optional(),
  comicguideid: z.number().int().optional(),
  series: SeriesInputSchema.optional(),
});

export const IndividualInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name ist erforderlich'),
  type: z.array(z.string()).optional(),
});

export const LoginInputSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
});

export const AppearanceInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name ist erforderlich'),
  type: z.string().optional(),
  role: z.string().optional(),
});

export const RealityInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name ist erforderlich'),
});

export const ArcInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Titel ist erforderlich'),
  type: z.string().optional(),
});

export const StoryInputSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    number: z.number().int(),
    title: z.string().optional(),
    parent: StoryInputSchema.optional(),
    reprintOf: StoryInputSchema.optional(),
    issue: IssueInputSchema.optional(),
    individuals: z.array(IndividualInputSchema).optional(),
    appearances: z.array(AppearanceInputSchema).optional(),
    addinfo: z.string().optional(),
    part: z.string().optional(),
    exclusive: z.boolean().optional(),
  }),
);

export const CoverInputSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    number: z.number().int(),
    parent: CoverInputSchema.optional(),
    issue: IssueInputSchema.optional(),
    individuals: z.array(IndividualInputSchema).optional(),
    addinfo: z.string().optional(),
    exclusive: z.boolean().optional(),
  }),
);

export const FilterSchema = z
  .object({
    us: z.boolean(),
    formats: z.array(z.string()).optional(),
    withVariants: z.boolean().optional(),
    releasedates: z.array(DateFilterSchema).optional(),
    publishers: z.array(PublisherFilterInputSchema).optional(),
    series: z.array(SeriesFilterInputSchema).optional(),
    genres: z.array(z.string()).optional(),
    numbers: z.array(NumberFilterSchema).optional(),
    arcs: z.array(ArcInputSchema).optional(),
    individuals: z.array(IndividualInputSchema).optional(),
    appearances: z.array(AppearanceInputSchema).optional(),
    realities: z.array(RealityInputSchema).optional(),
    firstPrint: z.boolean().optional(),
    notFirstPrint: z.boolean().optional(),
    onlyPrint: z.boolean().optional(),
    notOnlyPrint: z.boolean().optional(),
    onlyTb: z.boolean().optional(),
    notOnlyTb: z.boolean().optional(),
    exclusive: z.boolean().optional(),
    notExclusive: z.boolean().optional(),
    reprint: z.boolean().optional(),
    notReprint: z.boolean().optional(),
    otherOnlyTb: z.boolean().optional(),
    notOtherOnlyTb: z.boolean().optional(),
    noPrint: z.boolean().optional(),
    notNoPrint: z.boolean().optional(),
    onlyOnePrint: z.boolean().optional(),
    notOnlyOnePrint: z.boolean().optional(),
    onlyCollected: z.boolean().optional(),
    onlyNotCollected: z.boolean().optional(),
    onlyNotCollectedNoOwnedVariants: z.boolean().optional(),
    noComicguideId: z.boolean().optional(),
    noContent: z.boolean().optional(),
  })
  .refine(
    (value) =>
      [value.onlyCollected, value.onlyNotCollected, value.onlyNotCollectedNoOwnedVariants].filter(
        Boolean,
      ).length <= 1,
    {
      message:
        'onlyCollected, onlyNotCollected und onlyNotCollectedNoOwnedVariants schließen sich aus',
      path: ['onlyNotCollectedNoOwnedVariants'],
    },
  )
  .superRefine((value, ctx) => {
    const pairs: Array<[boolean | undefined, boolean | undefined, string, string]> = [
      [value.firstPrint, value.notFirstPrint, 'firstPrint', 'notFirstPrint'],
      [value.onlyPrint, value.notOnlyPrint, 'onlyPrint', 'notOnlyPrint'],
      [value.onlyTb, value.notOnlyTb, 'onlyTb', 'notOnlyTb'],
      [value.exclusive, value.notExclusive, 'exclusive', 'notExclusive'],
      [value.reprint, value.notReprint, 'reprint', 'notReprint'],
      [value.otherOnlyTb, value.notOtherOnlyTb, 'otherOnlyTb', 'notOtherOnlyTb'],
      [value.noPrint, value.notNoPrint, 'noPrint', 'notNoPrint'],
      [value.onlyOnePrint, value.notOnlyOnePrint, 'onlyOnePrint', 'notOnlyOnePrint'],
    ];

    pairs.forEach(([a, b, aName, bName]) => {
      if (a && b) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${aName} und ${bName} schließen sich aus`,
          path: [bName],
        });
      }
    });
  });
