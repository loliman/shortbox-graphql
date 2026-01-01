import { CoverResolvers } from '../../types/graphql';

export const resolvers: CoverResolvers = {
  Cover: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    parent: async (parent, _, { models }) =>
      parent.fk_parent ? await models.Cover.findByPk(parent.fk_parent) : null,
    children: async (parent, _, { models }) =>
      (await models.Cover.findAll({ where: { fk_parent: parent.id } })) as any,
    issue: async (parent, _, { issueLoader }) =>
      (parent as any).Issue || (await issueLoader.load(parent.fk_issue)),
    individuals: async (parent) =>
      (parent as any).getIndividuals ? await (parent as any).getIndividuals() : [],
    onlyapp: async (parent, _, { models, issueLoader }) => {
      // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
      const issue =
        (parent as any).Issue ||
        (await issueLoader.load(parent.fk_issue));
      return issue?.Series?.Publisher?.original === true;
    },
    exclusive: (parent) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
