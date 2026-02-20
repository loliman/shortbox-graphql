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

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

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
    children: async (parent, _, { storyChildrenLoader, storyReprintsLoader }) => {
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

      return mergedChildren;
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
