import { FeatureResolvers } from '../../types/graphql';

export const resolvers: FeatureResolvers = {
  Feature: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    title: (parent) => parent.title.trim(),
    issue: async (parent, _, { issueLoader }) =>
      (parent as any).Issue || (await issueLoader.load(parent.fk_issue)),
    individuals: async (parent) =>
      (parent as any).getIndividuals ? await (parent as any).getIndividuals() : [],
  },
};
