import { StoryResolvers } from '../../types/graphql';

type StoryParent = {
  id: number;
  fk_parent?: number | null;
  fk_reprint?: number | null;
  fk_issue: number;
  Issue?: unknown;
  onlyapp?: boolean;
  firstapp?: boolean;
  getIndividuals?: () => Promise<unknown[]>;
  getAppearances?: () => Promise<unknown[]>;
};

export const resolvers: StoryResolvers = {
  Story: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String((parent as StoryParent).id);
    },
    parent: async (parent, _, { storyLoader }) => {
      const fkParent = (parent as StoryParent).fk_parent;
      if (typeof fkParent === 'number') {
        return await storyLoader.load(fkParent);
      }
      return null;
    },
    children: async (parent, _, { storyChildrenLoader }) =>
      await storyChildrenLoader.load((parent as StoryParent).id),
    reprintOf: async (parent, _, { storyLoader }) => {
      const fkReprint = (parent as StoryParent).fk_reprint;
      if (typeof fkReprint === 'number') {
        return await storyLoader.load(fkReprint);
      }
      return null;
    },
    reprints: async (parent, _, { storyReprintsLoader }) =>
      await storyReprintsLoader.load((parent as StoryParent).id),
    issue: async (parent, _, { issueLoader }) =>
      (parent as StoryParent).Issue || (await issueLoader.load((parent as StoryParent).fk_issue)),
    individuals: async (parent) =>
      (parent as StoryParent).getIndividuals
        ? await (parent as StoryParent).getIndividuals?.()
        : [],
    appearances: async (parent) =>
      (parent as StoryParent).getAppearances
        ? await (parent as StoryParent).getAppearances?.()
        : [],
    exclusive: (parent) => !!((parent as StoryParent).onlyapp && (parent as StoryParent).firstapp),
  },
};
