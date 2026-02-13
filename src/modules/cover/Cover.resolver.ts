import { CoverResolvers } from '../../types/graphql';

type CoverParent = {
  id: number;
  fk_parent?: number | null;
  fk_issue: number;
  Issue?: unknown;
  getIndividuals?: () => Promise<unknown[]>;
};

export const resolvers: CoverResolvers = {
  Cover: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
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
    issue: async (parent, _, { issueLoader }) =>
      (parent as CoverParent).Issue || (await issueLoader.load((parent as CoverParent).fk_issue)),
    individuals: async (parent) =>
      (parent as CoverParent).getIndividuals
        ? await (parent as CoverParent).getIndividuals?.()
        : [],
    onlyapp: async (parent, _, { models, issueLoader }) => {
      // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
      const coverParent = parent as CoverParent;
      const issue = coverParent.Issue || (await issueLoader.load(coverParent.fk_issue));
      return (
        (issue as { Series?: { Publisher?: { original?: boolean } } } | null)?.Series?.Publisher
          ?.original === true
      );
    },
    exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
