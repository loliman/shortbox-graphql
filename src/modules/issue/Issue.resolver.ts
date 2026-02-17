import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { IssueInputSchema } from '../../types/schemas';

type IssueParent = {
  id: number;
  fk_series: number | null;
  number: string;
  comicguideid?: unknown;
  variant?: string;
  createdAt?: unknown;
  createdat?: unknown;
  updatedAt?: unknown;
  updatedat?: unknown;
  series?: unknown;
  Series?: unknown;
  story?: unknown;
  Stories?: unknown[];
  stories?: unknown[];
  Cover?: unknown;
  cover?: unknown;
  Covers?: unknown[];
  covers?: unknown[];
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

const resolveComicguideId = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  if (trimmed === '0') return null;

  return String(Number(trimmed));
};

const LEGACY_DATE_TIME_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

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
    issueList: async (_, { pattern, series, first, after, filter }, context) => {
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
    issueDetails: async (_, { issue }, { models }) => {
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
    createdat: (parent: unknown) => {
      const issueParent = parent as IssueParent;
      return normalizeDateTime(issueParent.createdat ?? issueParent.createdAt);
    },
    updatedat: (parent: unknown) => {
      const issueParent = parent as IssueParent;
      return normalizeDateTime(issueParent.updatedAt ?? issueParent.updatedat);
    },
    series: async (parent, _, { seriesLoader }) => {
      const issueParent = parent as IssueParent;
      if (issueParent.Series) return issueParent.Series;
      if (issueParent.series) return issueParent.series;

      if (!seriesLoader || typeof seriesLoader.load !== 'function') return null;
      if (issueParent.fk_series == null) return null;
      return await seriesLoader.load(issueParent.fk_series);
    },
    stories: async (parent, _, { issueStoriesLoader, issueVariantsLoader, models }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.Stories)) return issueParent.Stories;
      if (Array.isArray(issueParent.stories)) return issueParent.stories;
      if (!hasLoad<number, unknown[]>(issueStoriesLoader)) return [];

      const ownStories = await issueStoriesLoader.load(issueParent.id);
      if (Array.isArray(ownStories) && ownStories.length > 0) return ownStories;

      if (issueParent.fk_series == null || !issueParent.number) return ownStories ?? [];

      type IssueSibling = { id?: unknown; variant?: unknown };
      let siblings: IssueSibling[] = [];

      if (hasLoad<string, unknown[]>(issueVariantsLoader)) {
        const loadedSiblings = await issueVariantsLoader.load(
          `${issueParent.fk_series}::${issueParent.number}`,
        );
        if (Array.isArray(loadedSiblings)) siblings = loadedSiblings as IssueSibling[];
      }

      if (
        siblings.length === 0 &&
        models?.Issue &&
        typeof (models.Issue as { findAll?: unknown }).findAll === 'function'
      ) {
        const loadedSiblings = await models.Issue.findAll({
          where: { fk_series: issueParent.fk_series, number: issueParent.number },
          order: [['id', 'ASC']],
        });
        if (Array.isArray(loadedSiblings)) siblings = loadedSiblings as IssueSibling[];
      }

      const siblingIds = siblings
        .map((sibling) => (typeof sibling.id === 'number' ? sibling.id : null))
        .filter((id): id is number => id != null);
      const uniqueSiblingIds = [...new Set(siblingIds)].sort((a, b) => a - b);
      const primarySibling = siblings.find(
        (sibling) => typeof sibling.id === 'number' && String(sibling.variant ?? '').trim() === '',
      ) as { id: number } | undefined;

      const fallbackCandidateIds = [
        ...(primarySibling ? [primarySibling.id] : []),
        ...uniqueSiblingIds,
      ].filter((id, index, arr) => arr.indexOf(id) === index && id !== issueParent.id);

      for (const fallbackIssueId of fallbackCandidateIds) {
        const inheritedStories = await issueStoriesLoader.load(fallbackIssueId);
        if (Array.isArray(inheritedStories) && inheritedStories.length > 0) return inheritedStories;
      }

      return ownStories ?? [];
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
      const loadedCover = await issueCoverLoader.load(issueParent.id);
      if (loadedCover) return loadedCover;

      const comicguideId = resolveComicguideId(issueParent.comicguideid);
      if (!comicguideId) return null;

      return {
        fk_issue: issueParent.id,
        issue: issueParent,
        url: `https://www.comicguide.de/pics/large/${comicguideId}.jpg`,
      };
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
    variants: async (parent, _, { issueVariantsLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.variants)) return issueParent.variants;
      if (!hasLoad<string, unknown[]>(issueVariantsLoader)) return [];
      return await issueVariantsLoader.load(`${issueParent.fk_series}::${issueParent.number}`);
    },
  },
};
