import { StoryResolvers } from '../../types/graphql';

type StoryParent = {
  id: number;
  fk_parent?: number | null;
  fk_reprint?: number | null;
  fk_issue: number;
  parent?: unknown;
  Parent?: unknown;
  children?: unknown[];
  Children?: unknown[];
  reprintOf?: unknown;
  ReprintOf?: unknown;
  reprints?: unknown[];
  Reprints?: unknown[];
  issue?: unknown;
  Issue?: unknown;
  onlyapp?: boolean;
  firstapp?: boolean;
  getIndividuals?: () => Promise<unknown[]>;
  getAppearances?: (options?: { joinTableAttributes?: string[] }) => Promise<unknown[]>;
};

type IssueSortMeta = {
  id?: unknown;
  releasedate?: unknown;
  number?: unknown;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

const toNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
};

const toDateTimestamp = (value: unknown): number => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value.trim());
    if (!Number.isNaN(parsed)) return parsed;
  } else if (value instanceof Date) {
    const parsed = value.getTime();
    if (!Number.isNaN(parsed)) return parsed;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return Number.POSITIVE_INFINITY;
};

const toNumberSortValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return Number.POSITIVE_INFINITY;
    const numeric = Number(trimmed.replace(',', '.'));
    if (!Number.isNaN(numeric)) return numeric;
  }
  return Number.POSITIVE_INFINITY;
};

export const resolvers: StoryResolvers = {
  Story: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String((parent as StoryParent).id);
    },
    parent: async (parent, _, { storyLoader }) => {
      const storyParent = parent as StoryParent;
      if (storyParent.Parent) return storyParent.Parent;
      if (storyParent.parent) return storyParent.parent;

      const fkParent = storyParent.fk_parent;
      if (fkParent) {
        if (!hasLoad<number, unknown | null>(storyLoader)) return null;
        return await storyLoader.load(fkParent);
      }
      return null;
    },
    children: async (parent, _, { storyChildrenLoader, storyReprintsLoader, issueLoader }) => {
      const storyParent = parent as StoryParent;
      const preloadedChildren = Array.isArray(storyParent.Children)
        ? storyParent.Children
        : Array.isArray(storyParent.children)
          ? storyParent.children
          : null;

      const toIdKey = (value: unknown): string | null => {
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed.length > 0 ? trimmed : null;
        }
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return null;
      };

      if (!hasLoad<unknown, unknown[]>(storyChildrenLoader)) return preloadedChildren ?? [];
      const childrenLoader = storyChildrenLoader;

      const mergedChildren: unknown[] = [];
      const seenChildIds = new Set<string>();
      const pushUniqueChildren = (children: unknown[]) => {
        children.forEach((child) => {
          const childIdRaw = (child as { id?: unknown } | null | undefined)?.id;
          const childId = toIdKey(childIdRaw);
          if (childId == null) {
            mergedChildren.push(child);
            return;
          }
          if (seenChildIds.has(childId)) return;
          seenChildIds.add(childId);
          mergedChildren.push(child);
        });
      };

      const ownChildren = preloadedChildren ?? (await childrenLoader.load(storyParent.id));
      pushUniqueChildren(ownChildren);

      const currentStoryIdKey = toIdKey(storyParent.id);
      const relatedStoryIds = new Map<string, unknown>();
      const addRelatedStoryId = (value: unknown) => {
        const key = toIdKey(value);
        if (!key) return;
        if (currentStoryIdKey && key === currentStoryIdKey) return;
        if (!relatedStoryIds.has(key)) relatedStoryIds.set(key, value);
      };

      const reprintOfRaw =
        (storyParent.ReprintOf as { id?: unknown } | undefined)?.id ??
        (storyParent.reprintOf as { id?: unknown } | undefined)?.id ??
        storyParent.fk_reprint;
      addRelatedStoryId(reprintOfRaw);

      const preloadedReprints = Array.isArray(storyParent.Reprints)
        ? storyParent.Reprints
        : Array.isArray(storyParent.reprints)
          ? storyParent.reprints
          : null;
      const reprints =
        preloadedReprints ??
        (hasLoad<unknown, unknown[]>(storyReprintsLoader)
          ? await storyReprintsLoader.load(storyParent.id)
          : []);
      reprints.forEach((reprint) => {
        const reprintIdRaw = (reprint as { id?: unknown } | null | undefined)?.id;
        addRelatedStoryId(reprintIdRaw);
      });

      for (const relatedStoryId of relatedStoryIds.values()) {
        const relatedChildren = await childrenLoader.load(relatedStoryId);
        pushUniqueChildren(relatedChildren);
      }

      const withSortMeta = await Promise.all(
        mergedChildren.map(async (child) => {
          const childObject = child as {
            issue?: IssueSortMeta;
            Issue?: IssueSortMeta;
            fk_issue?: unknown;
            id?: unknown;
            number?: unknown;
          };

          let childIssue = childObject.Issue ?? childObject.issue ?? null;
          if (!childIssue && hasLoad<number, unknown | null>(issueLoader)) {
            const fkIssueId = toNumericId(childObject.fk_issue);
            if (fkIssueId != null) {
              childIssue = (await issueLoader.load(fkIssueId)) as IssueSortMeta | null;
            }
          }

          return {
            child,
            releasedateTs: toDateTimestamp(childIssue?.releasedate),
            issueNumber: toNumberSortValue(childIssue?.number),
            storyNumber: toNumberSortValue(childObject.number),
            storyId: toNumericId(childObject.id) ?? Number.POSITIVE_INFINITY,
          };
        }),
      );

      withSortMeta.sort((a, b) => {
        if (a.releasedateTs !== b.releasedateTs) return a.releasedateTs - b.releasedateTs;
        if (a.issueNumber !== b.issueNumber) return a.issueNumber - b.issueNumber;
        if (a.storyNumber !== b.storyNumber) return a.storyNumber - b.storyNumber;
        return a.storyId - b.storyId;
      });

      return withSortMeta.map((entry) => entry.child);
    },
    reprintOf: async (parent, _, { storyLoader }) => {
      const storyParent = parent as StoryParent;
      if (storyParent.ReprintOf) return storyParent.ReprintOf;
      if (storyParent.reprintOf) return storyParent.reprintOf;

      const fkReprint = storyParent.fk_reprint;
      if (fkReprint != null) {
        if (!hasLoad<unknown, unknown | null>(storyLoader)) return null;
        return await storyLoader.load(fkReprint);
      }
      return null;
    },
    reprints: async (parent, _, { storyReprintsLoader }) => {
      const storyParent = parent as StoryParent;
      if (Array.isArray(storyParent.Reprints)) return storyParent.Reprints;
      if (Array.isArray(storyParent.reprints)) return storyParent.reprints;
      if (!hasLoad<number, unknown[]>(storyReprintsLoader)) return [];
      return await storyReprintsLoader.load(storyParent.id);
    },
    issue: async (parent, _, { issueLoader }) => {
      const storyParent = parent as StoryParent;
      if (storyParent.Issue) return storyParent.Issue;
      if (storyParent.issue) return storyParent.issue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;
      return await issueLoader.load(storyParent.fk_issue);
    },
    individuals: async (parent) =>
      (parent as StoryParent).getIndividuals
        ? await (parent as StoryParent).getIndividuals?.()
        : [],
    appearances: async (parent) =>
      (parent as StoryParent).getAppearances
        ? await (parent as StoryParent).getAppearances?.({
            joinTableAttributes: ['role'],
          })
        : [],
    exclusive: (parent) => {
      const storyParent = parent as StoryParent;
      const hasOriginalStoryReference =
        Boolean(storyParent.Parent) || Boolean(storyParent.parent) || storyParent.fk_parent;

      return !hasOriginalStoryReference;
    },
  },
};
