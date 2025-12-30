export const resolvers = {
  Cover: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    parent: async (parent: any, _: any, { models }: any) =>
      parent.fk_parent ? await models.Cover.findByPk(parent.fk_parent) : null,
    children: async (parent: any, _: any, { models }: any) =>
      await models.Cover.findAll({ where: { fk_parent: parent.id } }),
    issue: async (parent: any, _: any, { models }: any) =>
      parent.Issue || (await models.Issue.findByPk(parent.fk_issue)),
    individuals: async (parent: any) =>
      parent.getIndividuals ? await parent.getIndividuals() : [],
    onlyapp: async (parent: any, _: any, { models }: any) => {
      // Logik analog zum Original: Prüfen ob es eine US-Ausgabe ist
      const issue =
        parent.Issue ||
        (await models.Issue.findByPk(parent.fk_issue, {
          include: [{ model: models.Series, include: [models.Publisher] }],
        }));
      return issue?.Series?.Publisher?.original === true;
    },
    exclusive: (parent: any) => false, // Platzhalter für komplexere Logik falls benötigt
  },
};
