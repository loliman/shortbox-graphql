import { SeriesService } from '../../services/SeriesService';
import { GraphQLError } from 'graphql';
import { SeriesResolvers } from '../../types/graphql';
import { SeriesInputSchema } from '../../types/schemas';

export const resolvers: SeriesResolvers = {
  Query: {
    series: async (_, { pattern, publisher, first, after, filter }, context) => {
      const { loggedIn, seriesService } = context;
      return (await seriesService.findSeries(
        pattern || undefined,
        publisher,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      )) as any;
    },
    seriesd: async (_, { series }, { models }) => {
      SeriesInputSchema.parse(series);
      return await models.Series.findOne({
        where: {
          title: series?.title || '',
          volume: series?.volume || 0,
          '$Publisher.name$': series?.publisher?.name || '',
        },
        include: [{ model: models.Publisher }],
      });
    },
  },
  Mutation: {
    deleteSeries: async (_, { item }, context) => {
      const { loggedIn, transaction, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(item);
        await seriesService.deleteSeries(item, transaction);
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
    createSeries: async (_, { item }, context) => {
      const { loggedIn, transaction, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(item);
        let res = await seriesService.createSeries(item, transaction);
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
    editSeries: async (_, { old, item }, context) => {
      const { loggedIn, transaction, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(old);
        SeriesInputSchema.parse(item);
        let res = await seriesService.editSeries(old, item, transaction);
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
  Series: {
    publisher: async (parent, _, { publisherLoader }) =>
      (parent as any).Publisher || (await publisherLoader.load(parent.fk_publisher)),
    issueCount: async (parent, _, { models }) =>
      await models.Issue.count({ where: { fk_series: parent.id }, group: ['number'] }).then(
        (res: any) => res.length,
      ),
    firstIssue: async (parent, _, { models }) =>
      (await models.Issue.findOne({
        where: { fk_series: parent.id },
        order: [['number', 'ASC']],
      })) as any,
    lastIssue: async (parent, _, { models }) =>
      (await models.Issue.findOne({
        where: { fk_series: parent.id },
        order: [['number', 'DESC']],
      })) as any,
    lastEdited: async (parent, { limit }, { models }) =>
      (await models.Issue.findAll({
        where: { fk_series: parent.id },
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      })) as any,
    active: (parent) => !parent.endyear || parent.endyear === 0,
  },
};
