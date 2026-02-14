import { FeatureResolvers } from '../../types/graphql';

type FeatureParent = {
  id: number;
  fk_issue: number;
  title: string;
  issue?: unknown;
  Issue?: unknown;
  getIndividuals?: () => Promise<unknown[]>;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

export const resolvers: FeatureResolvers = {
  Feature: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String((parent as FeatureParent).id);
    },
    title: (parent) => (parent as FeatureParent).title.trim(),
    issue: async (parent, _, { issueLoader }) => {
      const featureParent = parent as FeatureParent;
      if (featureParent.Issue) return featureParent.Issue;
      if (featureParent.issue) return featureParent.issue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;
      return await issueLoader.load(featureParent.fk_issue);
    },
    individuals: async (parent) =>
      (parent as FeatureParent).getIndividuals
        ? await (parent as FeatureParent).getIndividuals?.()
        : [],
  },
};
