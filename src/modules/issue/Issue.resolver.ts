import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { IssueInputSchema } from '../../types/schemas';
import { Op } from 'sequelize';

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

const toLoaderId = (value: unknown): number | string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    if (trimmed.length > 0) return trimmed;
  }
  return null;
};

const toNumericLoaderId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
};

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
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RELEASE_DATE_TIMEZONE = 'Europe/Berlin';

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

const normalizeReleaseDate = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (ISO_DATE_PATTERN.test(trimmed)) return trimmed;
  }

  const asDate =
    value instanceof Date ? value : typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  if (!asDate || Number.isNaN(asDate.getTime())) return null;

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RELEASE_DATE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(asDate);

  const year = dateParts.find((part) => part.type === 'year')?.value;
  const month = dateParts.find((part) => part.type === 'month')?.value;
  const day = dateParts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return null;

  return `${year}-${month}-${day}`;
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
      const requestedNumber = issue?.number || '';
      const requestedVariant = issue?.variant || '';
      const requestedFormat = typeof issue?.format === 'string' ? issue.format.trim() : '';
      const seriesInclude = {
        model: models.Series,
        where: { title: issue?.series?.title, volume: issue?.series?.volume },
        include: [
          {
            model: models.Publisher,
            where: { name: issue?.series?.publisher?.name },
          },
        ],
      };

      const exactWhere: Record<string, unknown> = {
        number: requestedNumber,
        variant: requestedVariant,
      };
      if (requestedFormat !== '') {
        exactWhere.format = requestedFormat;
      }

      const exactMatch = await models.Issue.findOne({
        where: exactWhere,
        include: [seriesInclude],
      });

      if (exactMatch) return exactMatch;
      if (requestedVariant.trim() !== '') return null;

      const variantFallbackWhere: Record<string, unknown> = {
        number: requestedNumber,
        variant: { [Op.ne]: '' },
      };
      if (requestedFormat !== '') {
        variantFallbackWhere.format = requestedFormat;
      }

      return await models.Issue.findOne({
        where: variantFallbackWhere,
        include: [seriesInclude],
        order: [
          ['variant', 'ASC'],
          ['id', 'ASC'],
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
    releasedate: (parent: unknown) => normalizeReleaseDate((parent as { releasedate?: unknown }).releasedate),
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
      if (Array.isArray(issueParent.Stories) && issueParent.Stories.length > 0) return issueParent.Stories;
      if (Array.isArray(issueParent.stories) && issueParent.stories.length > 0) return issueParent.stories;
      if (!hasLoad<number, unknown[]>(issueStoriesLoader)) return [];
      const issueId = toLoaderId(issueParent.id);
      if (issueId == null) return [];

      const ownStories = await issueStoriesLoader.load(issueId as number);
      if (Array.isArray(ownStories) && ownStories.length > 0) return ownStories;

      if (issueParent.fk_series == null || !issueParent.number) return ownStories ?? [];

      type IssueSibling = { id?: unknown; variant?: unknown };
      let siblings: IssueSibling[] = [];

      if (hasLoad<number, unknown[]>(issueVariantsLoader)) {
        const loadedSiblings = await issueVariantsLoader.load(issueId as number);
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
        .map((sibling) => toNumericLoaderId(sibling.id))
        .filter((id): id is number => id != null);
      const uniqueSiblingIds = [...new Set(siblingIds)].sort((a, b) => a - b);
      const primarySibling = siblings.find(
        (sibling) => toNumericLoaderId(sibling.id) != null && String(sibling.variant ?? '').trim() === '',
      ) as { id: number } | undefined;

      const fallbackCandidateIds = [
        ...(primarySibling ? [toNumericLoaderId(primarySibling.id)] : []),
        ...uniqueSiblingIds,
      ]
        .filter((id): id is number => id != null)
        .filter((id, index, arr) => arr.indexOf(id) === index && String(id) !== String(issueId));

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
      if (!hasLoad<number, unknown | null>(issueCoverLoader)) return null;
      const issueId = toLoaderId(issueParent.id);
      if (issueId == null) return null;
      const loadedCover = await issueCoverLoader.load(issueId as number);
      if (loadedCover) return loadedCover;

      const comicguideId = resolveComicguideId(issueParent.comicguideid);
      if (!comicguideId) return null;

      return {
        fk_issue: Number(issueId),
        issue: issueParent,
        url: `https://www.comicguide.de/pics/large/${comicguideId}.jpg`,
      };
    },
    individuals: async (parent) =>
      (parent as IssueParent).getIndividuals
        ? await (parent as IssueParent).getIndividuals?.()
        : [],
    arcs: async (parent) =>
      (parent as IssueParent).getArcs ? await (parent as IssueParent).getArcs?.() : [],
    variants: async (parent, _, { issueVariantsLoader }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.variants) && issueParent.variants.length > 0)
        return issueParent.variants;
      if (!hasLoad<number, unknown[]>(issueVariantsLoader)) return [];
      const issueId = toLoaderId(issueParent.id);
      if (issueId == null) return [];
      return await issueVariantsLoader.load(issueId as number);
    },
  },
};
