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

export const SeriesInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Titel ist erforderlich'),
  startyear: z.number().optional(),
  endyear: z.number().optional().nullable(),
  volume: z.number().int().min(1, 'Volume muss mindestens 1 sein'),
  addinfo: z.string().optional(),
  publisher: PublisherInputSchema.optional(),
});

export const IssueInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  number: z.string().min(1, 'Nummer ist erforderlich'),
  format: z.string().optional(),
  variant: z.string().optional(),
  releasedate: z.string().or(z.date()).optional().nullable(),
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

export const FilterSchema = z.object({
  us: z.boolean(),
  formats: z.array(z.string()).optional(),
  withVariants: z.boolean().optional(),
  releasedates: z.array(DateFilterSchema).optional(),
  publishers: z.array(PublisherInputSchema).optional(),
  series: z.array(SeriesInputSchema).optional(),
  numbers: z.array(NumberFilterSchema).optional(),
  arcs: z.string().optional(),
  individuals: z.array(IndividualInputSchema).optional(),
  appearances: z.string().optional(),
  firstPrint: z.boolean().optional(),
  onlyPrint: z.boolean().optional(),
  onlyTb: z.boolean().optional(),
  exclusive: z.boolean().optional(),
  reprint: z.boolean().optional(),
  otherOnlyTb: z.boolean().optional(),
  noPrint: z.boolean().optional(),
  onlyOnePrint: z.boolean().optional(),
  onlyCollected: z.boolean().optional(),
  onlyNotCollected: z.boolean().optional(),
  sellable: z.boolean().optional(),
  noCover: z.boolean().optional(),
  noContent: z.boolean().optional(),
  and: z.boolean().optional(),
});
