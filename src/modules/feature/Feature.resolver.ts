import { FeatureResolvers } from '../../types/graphql';

type FeatureParent = {
  id: number;
  fk_issue: number;
  title: string;
  Issue?: unknown;
  getIndividuals?: () => Promise<unknown[]>;
};

export const resolvers: FeatureResolvers = {
  Feature: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String((parent as FeatureParent).id);
    },
    title: (parent) => (parent as FeatureParent).title.trim(),
    issue: async (parent, _, { issueLoader }) =>
      (parent as FeatureParent).Issue ||
      (await issueLoader.load((parent as FeatureParent).fk_issue)),
    individuals: async (parent) =>
      (parent as FeatureParent).getIndividuals
        ? await (parent as FeatureParent).getIndividuals?.()
        : [],
  },
};
