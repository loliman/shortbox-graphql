import { StoryResolvers } from '../../types/graphql';

type StoryParent = {
  id: number | string;
  fk_parent?: number | string | null;
  fk_reprint?: number | string | null;
  fk_issue: number | string;
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
  getAppearances?: () => Promise<unknown[]>;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

const normalizeId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return value;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  return Number(trimmed);
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

      const fkParent = normalizeId(storyParent.fk_parent);
      if (fkParent !== null) {
        if (!hasLoad<number, unknown | null>(storyLoader)) return null;
        return await storyLoader.load(fkParent);
      }
      return null;
    },
    children: async (parent, _, { storyChildrenLoader }) => {
      const storyParent = parent as StoryParent;
      if (Array.isArray(storyParent.Children)) return storyParent.Children;
      if (Array.isArray(storyParent.children)) return storyParent.children;
      if (!hasLoad<number, unknown[]>(storyChildrenLoader)) return [];

      const storyId = normalizeId(storyParent.id);
      if (storyId === null) return [];

      return await storyChildrenLoader.load(storyId);
    },
    reprintOf: async (parent, _, { storyLoader }) => {
      const storyParent = parent as StoryParent;
      if (storyParent.ReprintOf) return storyParent.ReprintOf;
      if (storyParent.reprintOf) return storyParent.reprintOf;

      const fkReprint = normalizeId(storyParent.fk_reprint);
      if (fkReprint !== null) {
        if (!hasLoad<number, unknown | null>(storyLoader)) return null;
        return await storyLoader.load(fkReprint);
      }
      return null;
    },
    reprints: async (parent, _, { storyReprintsLoader }) => {
      const storyParent = parent as StoryParent;
      if (Array.isArray(storyParent.Reprints)) return storyParent.Reprints;
      if (Array.isArray(storyParent.reprints)) return storyParent.reprints;
      if (!hasLoad<number, unknown[]>(storyReprintsLoader)) return [];

      const storyId = normalizeId(storyParent.id);
      if (storyId === null) return [];

      return await storyReprintsLoader.load(storyId);
    },
    issue: async (parent, _, { issueLoader }) => {
      const storyParent = parent as StoryParent;
      if (storyParent.Issue) return storyParent.Issue;
      if (storyParent.issue) return storyParent.issue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;

      const issueId = normalizeId(storyParent.fk_issue);
      if (issueId === null) return null;

      return await issueLoader.load(issueId);
    },
    individuals: async (parent) =>
      (parent as StoryParent).getIndividuals
        ? await (parent as StoryParent).getIndividuals?.()
        : [],
    appearances: async (parent) =>
      (parent as StoryParent).getAppearances
        ? await (parent as StoryParent).getAppearances?.()
        : [],
    exclusive: (parent) => {
      const storyParent = parent as StoryParent;
      const hasOriginalStoryReference =
        Boolean(storyParent.Parent) ||
        Boolean(storyParent.parent) ||
        normalizeId(storyParent.fk_parent) !== null;

      return !hasOriginalStoryReference;
    },
  },
};
