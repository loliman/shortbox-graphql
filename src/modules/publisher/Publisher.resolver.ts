import { PublisherService } from '../../services/PublisherService';
import { GraphQLError } from 'graphql';
import { PublisherResolvers } from '../../types/graphql';
import { PublisherInputSchema } from '../../types/schemas';

export const resolvers: PublisherResolvers = {
  Query: {
    publishers: async (_, { pattern, us, first, after, filter }, context) => {
      const { loggedIn, publisherService } = context;
      return (await publisherService.findPublishers(
        pattern || undefined,
        us !== null && us !== undefined ? us : undefined,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      )) as any;
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
      const { loggedIn, transaction, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(item);
        await publisherService.deletePublisher(item as any, transaction);
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
    createPublisher: async (_, { item }, context) => {
      const { loggedIn, transaction, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(item);
        let res = await publisherService.createPublisher(item, transaction);
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
    editPublisher: async (_, { old, item }, context) => {
      const { loggedIn, transaction, publisherService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        PublisherInputSchema.parse(old);
        PublisherInputSchema.parse(item);
        let res = await publisherService.editPublisher(old, item, transaction);
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
  Publisher: {
    id: (parent, _, { loggedIn }) => {
      if (!loggedIn) return String(new Date().getTime());
      return String(parent.id);
    },
    us: (parent) => !!parent.original,
    seriesCount: async (parent, _, { models }) =>
      await models.Series.count({ where: { fk_publisher: parent.id } }),
    issueCount: async (parent, _, { models }) => {
      let res = await models.Issue.findAll({
        where: { '$Series.fk_publisher$': parent.id },
        group: ['fk_series', 'number'],
        include: [{ model: models.Series as any }],
      });
      return res.length;
    },
    lastEdited: async (parent, { limit }, { models }) =>
      (await models.Issue.findAll({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: parent.id },
          },
        ],
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      })) as any,
    firstIssue: async (parent, _, { models }) =>
      (await models.Issue.findOne({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: parent.id },
          },
        ],
        order: [
          ['number', 'ASC'],
          ['variant', 'ASC'],
        ],
      })) as any,
    lastIssue: async (parent, _, { models }) =>
      (await models.Issue.findOne({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: parent.id },
          },
        ],
        order: [
          ['number', 'DESC'],
          ['variant', 'DESC'],
        ],
      })) as any,
    active: (parent) => !parent.endyear || parent.endyear === 0,
  },
};
