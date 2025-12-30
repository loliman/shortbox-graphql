export const resolvers = {
  Feature: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    title: (parent: any) => parent.title.trim(),
    issue: async (parent: any, _: any, { models }: any) =>
      parent.Issue || (await models.Issue.findByPk(parent.fk_issue)),
    individuals: async (parent: any) =>
      parent.getIndividuals ? await parent.getIndividuals() : [],
  },
};
