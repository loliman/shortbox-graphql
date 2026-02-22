import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { FilterSchema, IssueInputSchema } from '../../types/schemas';
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
  stories?: unknown[];
  cover?: unknown;
  variants?: unknown[];
  __shortboxEdit?: boolean;
  getIndividuals?: () => Promise<unknown[]>;
  getArcs?: () => Promise<unknown[]>;
};

type IssueSibling = { id?: unknown; variant?: unknown };

type StoryResolutionState = {
  ownStories: unknown[];
  resolvedStories: unknown[];
  ownerIssueId: number | null;
  inheritsStories: boolean;
  siblings: IssueSibling[];
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
    value instanceof Date
      ? value
      : typeof value === 'number' || typeof value === 'string'
        ? new Date(value)
        : null;
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

const emptyStoryResolutionState: StoryResolutionState = {
  ownStories: [],
  resolvedStories: [],
  ownerIssueId: null,
  inheritsStories: false,
  siblings: [],
};

const loadSiblings = async (
  issueParent: IssueParent,
  issueId: number,
  issueVariantsLoader: unknown,
  models: unknown,
): Promise<IssueSibling[]> => {
  let siblings: IssueSibling[] = [];

  if (hasLoad<number, unknown[]>(issueVariantsLoader)) {
    const loadedSiblings = await issueVariantsLoader.load(issueId);
    if (Array.isArray(loadedSiblings)) siblings = loadedSiblings as IssueSibling[];
  }

  if (
    siblings.length === 0 &&
    models &&
    typeof models === 'object' &&
    'Issue' in models &&
    (models as { Issue?: unknown }).Issue &&
    typeof (models as { Issue?: { findAll?: unknown } }).Issue?.findAll === 'function'
  ) {
    const loadedSiblings = await (
      models as { Issue: { findAll: (params: unknown) => Promise<unknown[]> } }
    ).Issue.findAll({
      where: { fk_series: issueParent.fk_series, number: issueParent.number },
      order: [['id', 'ASC']],
    });
    if (Array.isArray(loadedSiblings)) siblings = loadedSiblings as IssueSibling[];
  }

  return siblings;
};

const resolveStoryState = async (
  issueParent: IssueParent,
  issueStoriesLoader: unknown,
  issueVariantsLoader: unknown,
  models: unknown,
): Promise<StoryResolutionState> => {
  if (!hasLoad<number, unknown[]>(issueStoriesLoader)) return emptyStoryResolutionState;
  const issueId = toNumericLoaderId(issueParent.id);
  if (issueId == null) return emptyStoryResolutionState;

  const ownStories = await issueStoriesLoader.load(issueId);
  if (Array.isArray(ownStories) && ownStories.length > 0) {
    return {
      ownStories,
      resolvedStories: ownStories,
      ownerIssueId: issueId,
      inheritsStories: false,
      siblings: [],
    };
  }

  if (issueParent.fk_series == null || !issueParent.number) {
    return {
      ownStories: ownStories ?? [],
      resolvedStories: ownStories ?? [],
      ownerIssueId: null,
      inheritsStories: false,
      siblings: [],
    };
  }

  const siblings = await loadSiblings(issueParent, issueId, issueVariantsLoader, models);
  const siblingIds = siblings
    .map((sibling) => toNumericLoaderId(sibling.id))
    .filter((id): id is number => id != null);
  const uniqueSiblingIds = [...new Set(siblingIds)].sort((a, b) => a - b);
  const primarySibling = siblings.find(
    (sibling) =>
      toNumericLoaderId(sibling.id) != null && String(sibling.variant ?? '').trim() === '',
  ) as { id: number } | undefined;

  const fallbackCandidateIds = [
    ...(primarySibling ? [toNumericLoaderId(primarySibling.id)] : []),
    ...uniqueSiblingIds,
  ]
    .filter((id): id is number => id != null)
    .filter((id, index, arr) => arr.indexOf(id) === index && id !== issueId);

  for (const fallbackIssueId of fallbackCandidateIds) {
    const inheritedStories = await issueStoriesLoader.load(fallbackIssueId);
    if (Array.isArray(inheritedStories) && inheritedStories.length > 0) {
      return {
        ownStories: ownStories ?? [],
        resolvedStories: inheritedStories,
        ownerIssueId: fallbackIssueId,
        inheritsStories: true,
        siblings,
      };
    }
  }

  return {
    ownStories: ownStories ?? [],
    resolvedStories: ownStories ?? [],
    ownerIssueId: null,
    inheritsStories: false,
    siblings,
  };
};

export const resolvers: IssueResolvers = {
  Query: {
    issueList: async (_, { pattern, series, first, after, filter }, context) => {
      const { loggedIn, issueService } = context;
      const validatedFilter = filter ? FilterSchema.parse(filter) : undefined;
      return await issueService.findIssues(
        pattern || undefined,
        series,
        first || undefined,
        after || undefined,
        loggedIn,
        validatedFilter as any,
      );
    },
    issueDetails: async (_, { issue, edit }, { models }) => {
      IssueInputSchema.parse(issue);
      const requestedNumber = issue?.number || '';
      const requestedVariant = issue?.variant || '';
      const requestedFormat = typeof issue?.format === 'string' ? issue.format.trim() : '';
      const seriesInclude = {
        model: models.Series,
        as: 'series',
        where: { title: issue?.series?.title, volume: issue?.series?.volume },
        include: [
          {
            model: models.Publisher,
            as: 'publisher',
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

      if (exactMatch) {
        if (Boolean(edit)) (exactMatch as IssueParent).__shortboxEdit = true;
        return exactMatch;
      }
      if (requestedVariant.trim() !== '') return null;

      const variantFallbackWhere: Record<string, unknown> = {
        number: requestedNumber,
        variant: { [Op.ne]: '' },
      };
      if (requestedFormat !== '') {
        variantFallbackWhere.format = requestedFormat;
      }

      const fallback = await models.Issue.findOne({
        where: variantFallbackWhere,
        include: [seriesInclude],
        order: [
          ['variant', 'ASC'],
          ['id', 'ASC'],
        ],
      });
      if (fallback && Boolean(edit)) (fallback as IssueParent).__shortboxEdit = true;
      return fallback;
    },
    lastEdited: async (_, { filter, first, after, order, direction }, context) => {
      const { issueService, loggedIn } = context;
      try {
        const validatedFilter = filter ? FilterSchema.parse(filter) : undefined;
        return await issueService.getLastEdited(
          validatedFilter as any,
          first || undefined,
          after || undefined,
          order || undefined,
          direction || undefined,
          loggedIn,
        );
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
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
    releasedate: (parent: unknown) =>
      normalizeReleaseDate((parent as { releasedate?: unknown }).releasedate),
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
      if (issueParent.series) return issueParent.series;

      if (!seriesLoader || typeof seriesLoader.load !== 'function') return null;
      if (issueParent.fk_series == null) return null;
      return await seriesLoader.load(issueParent.fk_series);
    },
    stories: async (parent, _, { issueStoriesLoader, issueVariantsLoader, models }) => {
      const issueParent = parent as IssueParent;
      if (Array.isArray(issueParent.stories) && issueParent.stories.length > 0) {
        return issueParent.stories;
      }
      const storyState = await resolveStoryState(
        issueParent,
        issueStoriesLoader,
        issueVariantsLoader,
        models,
      );
      if (issueParent.__shortboxEdit) return storyState.ownStories;
      return storyState.resolvedStories;
    },
    storyOwner: async (
      parent,
      _,
      { issueStoriesLoader, issueVariantsLoader, issueLoader, models },
    ) => {
      const issueParent = parent as IssueParent;
      const storyState = await resolveStoryState(
        issueParent,
        issueStoriesLoader,
        issueVariantsLoader,
        models,
      );
      const issueId = toNumericLoaderId(issueParent.id);
      const ownerIssueId = storyState.ownerIssueId;
      if (ownerIssueId == null) return null;
      if (issueId != null && ownerIssueId === issueId) return issueParent;

      if (hasLoad<number, unknown | null>(issueLoader)) {
        const loadedOwner = await issueLoader.load(ownerIssueId);
        if (loadedOwner) return loadedOwner;
      }

      const siblingOwner = storyState.siblings.find(
        (sibling) => toNumericLoaderId(sibling.id) === ownerIssueId,
      );
      return siblingOwner ?? null;
    },
    inheritsStories: async (parent, _, { issueStoriesLoader, issueVariantsLoader, models }) => {
      const issueParent = parent as IssueParent;
      const storyState = await resolveStoryState(
        issueParent,
        issueStoriesLoader,
        issueVariantsLoader,
        models,
      );
      return storyState.inheritsStories;
    },
    cover: async (parent, _, { issueCoverLoader }) => {
      const issueParent = parent as IssueParent;
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
