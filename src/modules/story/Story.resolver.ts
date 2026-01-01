import { StoryResolvers } from '../../types/graphql';

export const resolvers: StoryResolvers = {
  Story: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    parent: async (parent, _, { storyLoader }) =>
      parent.fk_parent ? await storyLoader.load(parent.fk_parent) : null,
    children: async (parent, _, { models }) =>
      await models.Story.findAll({ where: { fk_parent: parent.id } }),
    reprintOf: async (parent, _, { storyLoader }) =>
      parent.fk_reprint ? await storyLoader.load(parent.fk_reprint) : null,
    reprints: async (parent, _, { models }) =>
      await models.Story.findAll({ where: { fk_reprint: parent.id } }),
    issue: async (parent, _, { issueLoader }) =>
      (parent as any).Issue || (await issueLoader.load(parent.fk_issue)),
    individuals: async (parent) =>
      (parent as any).getIndividuals ? await (parent as any).getIndividuals() : [],
    appearances: async (parent) =>
      (parent as any).getAppearances ? await (parent as any).getAppearances() : [],
    exclusive: (parent) => !!(parent.onlyapp && parent.firstapp),
  },
};
