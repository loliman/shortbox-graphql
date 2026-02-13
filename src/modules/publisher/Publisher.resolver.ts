import { PublisherService } from '../../services/PublisherService';
import { GraphQLError } from 'graphql';
import { PublisherResolvers } from '../../types/graphql';
import { PublisherInputSchema } from '../../types/schemas';

type PublisherParent = {
  id: number;
  original?: boolean;
  endyear?: number | null;
};

export const resolvers: PublisherResolvers = {
  Query: {
    publishers: async (_, { pattern, us, first, after, filter }, context) => {
      const { loggedIn, publisherService } = context;
      return await publisherService.findPublishers(
        pattern || undefined,
        us,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      );
    },
    publisher: (_, { publisher }, { models }) => {
      PublisherInputSchema.parse(publisher);
      return models.Publisher.findOne({
        where: {
          name: publisher?.name || '',
        },
      });
    },
  },
  Mutation: {
    deletePublisher: async (_, { item }, context) => {
      const { loggedIn, models, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          await publisherService.deletePublisher(item, tx);
          return true;
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    createPublisher: async (_, { item }, context) => {
      const { loggedIn, models, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await publisherService.createPublisher(item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    editPublisher: async (_, { old, item }, context) => {
      const { loggedIn, models, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(old);
        PublisherInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await publisherService.editPublisher(old, item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Publisher: {
    id: (parent, _, { loggedIn }) => {
      const publisherParent = parent as PublisherParent;
      if (!loggedIn) return String(new Date().getTime());
      return String(publisherParent.id);
    },
    us: (parent) => !!(parent as PublisherParent).original,
    seriesCount: async (parent, _, { models }) =>
      await models.Series.count({ where: { fk_publisher: (parent as PublisherParent).id } }),
    issueCount: async (parent, _, { models }) => {
      let res = await models.Issue.findAll({
        where: { '$Series.fk_publisher$': (parent as PublisherParent).id },
        group: ['fk_series', 'number'],
        include: [{ model: models.Series }],
      });
      return res.length;
    },
    lastEdited: async (parent, { limit }, { models }) =>
      await models.Issue.findAll({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: (parent as PublisherParent).id },
          },
        ],
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      }),
    firstIssue: async (parent, _, { models }) =>
      await models.Issue.findOne({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: (parent as PublisherParent).id },
          },
        ],
        order: [
          ['number', 'ASC'],
          ['variant', 'ASC'],
        ],
      }),
    lastIssue: async (parent, _, { models }) =>
      await models.Issue.findOne({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: (parent as PublisherParent).id },
          },
        ],
        order: [
          ['number', 'DESC'],
          ['variant', 'DESC'],
        ],
      }),
    active: (parent) =>
      !(parent as PublisherParent).endyear || (parent as PublisherParent).endyear === 0,
  },
};
