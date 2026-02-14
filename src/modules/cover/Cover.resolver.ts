import { CoverResolvers } from '../../types/graphql';

type CoverParent = {
  id: number;
  fk_parent?: number | null;
  fk_issue: number;
  issue?: unknown;
  Issue?: unknown;
  getIndividuals?: () => Promise<unknown[]>;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

export const resolvers: CoverResolvers = {
  Cover: {
    id: (parent, _, { loggedIn }) => {
      const coverParent = parent as CoverParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(coverParent.id);
    },
    parent: async (parent, _, { models }) => {
      const fkParent = (parent as CoverParent).fk_parent;
      if (typeof fkParent === 'number') {
        return await models.Cover.findByPk(fkParent);
      }
      return null;
    },
    children: async (parent, _, { models }) =>
      await models.Cover.findAll({ where: { fk_parent: (parent as CoverParent).id } }),
    issue: async (parent, _, { issueLoader }) => {
      const coverParent = parent as CoverParent;
      if (coverParent.Issue) return coverParent.Issue;
      if (coverParent.issue) return coverParent.issue;
      if (!hasLoad<number, unknown | null>(issueLoader)) return null;
      return await issueLoader.load(coverParent.fk_issue);
    },
    individuals: async (parent) =>
      (parent as CoverParent).getIndividuals
        ? await (parent as CoverParent).getIndividuals?.()
        : [],
    onlyapp: async (parent, _, { models, issueLoader }) => {
      // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
      const coverParent = parent as CoverParent;
      const issue =
        coverParent.Issue ||
        coverParent.issue ||
        (hasLoad<number, unknown | null>(issueLoader)
          ? await issueLoader.load(coverParent.fk_issue)
          : null);
      return (
        (issue as { Series?: { Publisher?: { original?: boolean } } } | null)?.Series?.Publisher
          ?.original === true
      );
    },
    exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
