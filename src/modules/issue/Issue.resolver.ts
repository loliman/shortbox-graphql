import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { IssueInputSchema } from '../../types/schemas';

export const resolvers: IssueResolvers = {
  Query: {
    issues: async (_, { pattern, series, first, after, filter }, context) => {
      const { loggedIn, issueService } = context;
      return (await issueService.findIssues(
        pattern || undefined,
        series,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      )) as any;
    },
    issue: async (_, { issue }, { models }) => {
      IssueInputSchema.parse(issue);
      return await models.Issue.findOne({
        where: { number: issue?.number || '', variant: issue?.variant || '' },
        include: [
          {
            model: models.Series,
            where: { title: issue?.series?.title, volume: issue?.series?.volume },
            include: [
              {
                model: models.Publisher,
                where: { name: issue?.series?.publisher?.name },
              },
            ],
          },
        ],
      });
    },
    lastEdited: async (_, { filter, first, after, order, direction }, context) => {
      const { issueService, loggedIn } = context;
      return await issueService.getLastEdited(
        filter || undefined,
        first || undefined,
        after || undefined,
        order || undefined,
        direction || undefined,
        loggedIn
      );
    },
  },
  Mutation: {
    deleteIssue: async (_, { item }, context) => {
      const { loggedIn, transaction, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        await issueService.deleteIssue(item, transaction);
        await transaction.commit();
        return true;
      } catch (e) {
        await transaction.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    createIssue: async (_, { item }, context) => {
      const { loggedIn, transaction, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        let res = await issueService.createIssue(item, transaction);
        await transaction.commit();
        return res as any;
      } catch (e) {
        await transaction.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    editIssue: async (_, { old, item }, context) => {
      const { loggedIn, transaction, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(old);
        IssueInputSchema.parse(item);
        let res = await issueService.editIssue(old, item, transaction);
        await transaction.commit();
        return res as any;
      } catch (e) {
        await transaction.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Issue: {
    series: async (parent, _, { seriesLoader }) =>
      (parent as any).Series || (await seriesLoader.load(parent.fk_series)),
    stories: async (parent, _, { models }) =>
      (await models.Story.findAll({
        where: { fk_issue: parent.id },
        order: [['number', 'ASC']],
      })) as any,
    cover: async (parent, _, { models }) =>
      (await models.Cover.findOne({ where: { fk_issue: parent.id, number: 0 } })) as any,
    covers: async (parent, _, { models }) =>
      (await models.Cover.findAll({
        where: { fk_issue: parent.id },
        order: [['number', 'ASC']],
      })) as any,
    individuals: async (parent) =>
      (parent as any).getIndividuals ? await (parent as any).getIndividuals() : [],
    arcs: async (parent) => ((parent as any).getArcs ? await (parent as any).getArcs() : []),
    features: async (parent, _, { models }) =>
      (await models.Feature.findAll({ where: { fk_issue: parent.id } })) as any,
    variants: async (parent, _, { models }) =>
      (await models.Issue.findAll({
        where: { fk_series: parent.fk_series, number: parent.number },
        order: [['variant', 'ASC']],
      })) as any,
  },
};
