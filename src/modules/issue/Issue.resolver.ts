import { IssueService } from '../../services/IssueService';
import { GraphQLError } from 'graphql';
import { IssueResolvers } from '../../types/graphql';
import { IssueInputSchema } from '../../types/schemas';

type IssueParent = {
  id: number;
  fk_series: number;
  number: string;
  Series?: unknown;
  getIndividuals?: () => Promise<unknown[]>;
  getArcs?: () => Promise<unknown[]>;
};

export const resolvers: IssueResolvers = {
  Query: {
    issues: async (_, { pattern, series, first, after, filter }, context) => {
      const { loggedIn, issueService } = context;
      return await issueService.findIssues(
        pattern || undefined,
        series,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      );
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
        loggedIn,
      );
    },
  },
  Mutation: {
    deleteIssue: async (_, { item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          await issueService.deleteIssue(item, tx);
          return true;
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    createIssue: async (_, { item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await issueService.createIssue(item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    editIssue: async (_, { old, item }, context) => {
      const { loggedIn, models, issueService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        IssueInputSchema.parse(old);
        IssueInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await issueService.editIssue(old, item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Issue: {
    series: async (parent, _, { seriesLoader }) =>
      (parent as IssueParent).Series ||
      (await seriesLoader.load((parent as IssueParent).fk_series)),
    stories: async (parent, _, { issueStoriesLoader }) =>
      await issueStoriesLoader.load((parent as IssueParent).id),
    cover: async (parent, _, { issueCoverLoader }) =>
      await issueCoverLoader.load((parent as IssueParent).id),
    covers: async (parent, _, { issueCoversLoader }) =>
      await issueCoversLoader.load((parent as IssueParent).id),
    individuals: async (parent) =>
      (parent as IssueParent).getIndividuals
        ? await (parent as IssueParent).getIndividuals?.()
        : [],
    arcs: async (parent) =>
      (parent as IssueParent).getArcs ? await (parent as IssueParent).getArcs?.() : [],
    features: async (parent, _, { issueFeaturesLoader }) =>
      await issueFeaturesLoader.load((parent as IssueParent).id),
    variants: async (parent, _, { issueVariantsLoader }) =>
      await issueVariantsLoader.load(
        `${(parent as IssueParent).fk_series}::${(parent as IssueParent).number}`,
      ),
  },
};
