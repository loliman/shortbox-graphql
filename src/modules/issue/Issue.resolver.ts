import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { IssueInputSchema } from '../../types/schemas';

type IssueParent = {
  id: number;
  fk_series: number;
  number: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  series?: unknown;
  Series?: unknown;
  story?: unknown;
  Stories?: unknown[];
  stories?: unknown[];
  Cover?: unknown;
  cover?: unknown;
  Covers?: unknown[];
  covers?: unknown[];
  Feature?: unknown;
  Features?: unknown[];
  features?: unknown[];
  variants?: unknown[];
  Individuals?: unknown[];
  individuals?: unknown[];
  Arcs?: unknown[];
  arcs?: unknown[];
  getIndividuals?: () => Promise<unknown[]>;
  getArcs?: () => Promise<unknown[]>;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

const LEGACY_DATE_TIME_PATTERN =
  /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const normalizeDateTime = (value: unknown): string | null => {
  const toIso = (date: Date): string | null =>
    Number.isNaN(date.getTime()) ? null : date.toISOString();

  if (value instanceof Date) {
    return toIso(value);
  }

  if (typeof value === 'number') {
    return toIso(new Date(value));
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const directTimestamp = Date.parse(trimmed);
  if (!Number.isNaN(directTimestamp)) {
    return toIso(new Date(directTimestamp));
  }

  const match = trimmed.match(LEGACY_DATE_TIME_PATTERN);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw = '00', minuteRaw = '00', secondRaw = '00'] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);

  const parsed = new Date(year, month - 1, day, hour, minute, second);
  const isValid =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day &&
    parsed.getHours() === hour &&
    parsed.getMinutes() === minute &&
    parsed.getSeconds() === second;

  return isValid ? toIso(parsed) : null;
};

export const resolvers: IssueResolvers = {
  Query: {
    issues: async (_, { pattern, series, first, after, filter }, context) => {
      const { loggedIn, issueService } = context;
      return await issueService.findIssues(
        pattern || undefined,
        series,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      );
    },
    issue: async (_, { issue }, { models }) => {
      IssueInputSchema.parse(issue);
      return await models.Issue.findOne({
        where: { number: issue?.number || '', variant: issue?.variant || '' },
        include: [
          {
            model: models.Series,
            where: { title: issue?.series?.title, volume: issue?.series?.volume },
            include: [
              {
                model: models.Publisher,
                where: { name: issue?.series?.publisher?.name },
              },
            ],
          },
        ],
      });
    },
    lastEdited: async (_, { filter, first, after, order, direction }, context) => {
      const { issueService, loggedIn } = context;
      return await issueService.getLastEdited(
        filter || undefined,
        first || undefined,
        after || undefined,
        order || undefined,
        direction || undefined,
        loggedIn,
      );
    },
  },
  Mutation: {
    deleteIssue: async (_, { item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          await issueService.deleteIssue(item, tx);
          return true;
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    createIssue: async (_, { item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await issueService.createIssue(item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    editIssue: async (_, { old, item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(old);
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await issueService.editIssue(old, item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Issue: {
    createdAt: (parent) => normalizeDateTime((parent as IssueParent).createdAt),
    updatedAt: (parent) => normalizeDateTime((parent as IssueParent).updatedAt),
    series: async (parent, _, { seriesLoader }) => {
      const issueParent = parent as IssueParent;
      if (issueParent.Series) return issueParent.Series;
      if (issueParent.series) return issueParent.series;

      if (!seriesLoader || typeof seriesLoader.load !== 'function') return null;
      return await seriesLoader.load(issueParent.fk_series);
    },
    stories: async (parent, _, { issueStoriesLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.Stories)) return issueParent.Stories;
      if (Array.isArray(issueParent.stories)) return issueParent.stories;
      if (!hasLoad<number, unknown[]>(issueStoriesLoader)) return [];
      return await issueStoriesLoader.load(issueParent.id);
    },
    cover: async (parent, _, { issueCoverLoader }) => {
      const issueParent = parent as IssueParent;
      if (issueParent.Cover) return issueParent.Cover;
      if (issueParent.cover) return issueParent.cover;
      if (Array.isArray(issueParent.Covers) && issueParent.Covers.length > 0) {
        return issueParent.Covers[0] || null;
      }
      if (Array.isArray(issueParent.covers) && issueParent.covers.length > 0) {
        return issueParent.covers[0] || null;
      }
      if (!hasLoad<number, unknown | null>(issueCoverLoader)) return null;
      return await issueCoverLoader.load(issueParent.id);
    },
    covers: async (parent, _, { issueCoversLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.Covers)) return issueParent.Covers;
      if (Array.isArray(issueParent.covers)) return issueParent.covers;
      if (!hasLoad<number, unknown[]>(issueCoversLoader)) return [];
      return await issueCoversLoader.load(issueParent.id);
    },
    individuals: async (parent) =>
      (parent as IssueParent).getIndividuals
        ? await (parent as IssueParent).getIndividuals?.()
        : [],
    arcs: async (parent) =>
      (parent as IssueParent).getArcs ? await (parent as IssueParent).getArcs?.() : [],
    features: async (parent, _, { issueFeaturesLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.Features)) return issueParent.Features;
      if (Array.isArray(issueParent.features)) return issueParent.features;
      if (!hasLoad<number, unknown[]>(issueFeaturesLoader)) return [];
      return await issueFeaturesLoader.load(issueParent.id);
    },
    variants: async (parent, _, { issueVariantsLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.variants)) return issueParent.variants;
      if (!hasLoad<string, unknown[]>(issueVariantsLoader)) return [];
      return await issueVariantsLoader.load(`${issueParent.fk_series}::${issueParent.number}`);
    },
  },
};
