export const resolvers = {
  Story: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    parent: async (parent: any, _: any, { models }: any) =>
      parent.fk_parent ? await models.Story.findByPk(parent.fk_parent) : null,
    children: async (parent: any, _: any, { models }: any) =>
      await models.Story.findAll({ where: { fk_parent: parent.id } }),
    reprintOf: async (parent: any, _: any, { models }: any) =>
      parent.fk_reprint ? await models.Story.findByPk(parent.fk_reprint) : null,
    reprints: async (parent: any, _: any, { models }: any) =>
      await models.Story.findAll({ where: { fk_reprint: parent.id } }),
    issue: async (parent: any, _: any, { models }: any) =>
      parent.Issue || (await models.Issue.findByPk(parent.fk_issue)),
    individuals: async (parent: any) =>
      parent.getIndividuals ? await parent.getIndividuals() : [],
    appearances: async (parent: any) =>
      parent.getAppearances ? await parent.getAppearances() : [],
    exclusive: (parent: any) => parent.onlyapp && parent.firstapp,
  },
};
