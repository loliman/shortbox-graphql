import { SeriesService } from '../../services/SeriesService';
import { GraphQLError } from 'graphql';
import { SeriesResolvers } from '../../types/graphql';
import { SeriesInputSchema } from '../../types/schemas';
import { Transaction } from 'sequelize';

type SeriesParent = {
  id: number;
  fk_publisher: number;
  endyear?: number | null;
  Publisher?: unknown;
};

const requireTransaction = (transaction: Transaction | undefined): Transaction => {
  if (!transaction) {
    throw new GraphQLError('Transaktion konnte nicht erstellt werden', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }
  return transaction;
};

export const resolvers: SeriesResolvers = {
  Query: {
    series: async (_, { pattern, publisher, first, after, filter }, context) => {
      const { loggedIn, seriesService } = context;
      return await seriesService.findSeries(
        pattern || undefined,
        publisher,
        first || undefined,
        after || undefined,
        loggedIn,
        filter || undefined,
      );
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
        const tx = requireTransaction(transaction);
        SeriesInputSchema.parse(item);
        await seriesService.deleteSeries(item, tx);
        await tx.commit();
        return true;
      } catch (e) {
        if (transaction) await transaction.rollback();
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
        const tx = requireTransaction(transaction);
        SeriesInputSchema.parse(item);
        let res = await seriesService.createSeries(item, tx);
        await tx.commit();
        return res;
      } catch (e) {
        if (transaction) await transaction.rollback();
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
        const tx = requireTransaction(transaction);
        SeriesInputSchema.parse(old);
        SeriesInputSchema.parse(item);
        let res = await seriesService.editSeries(old, item, tx);
        await tx.commit();
        return res;
      } catch (e) {
        if (transaction) await transaction.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Series: {
    publisher: async (parent, _, { publisherLoader }) =>
      (parent as SeriesParent).Publisher ||
      (await publisherLoader.load((parent as SeriesParent).fk_publisher)),
    issueCount: async (parent, _, { models }) =>
      await models.Issue.count({ where: { fk_series: (parent as SeriesParent).id }, group: ['number'] }).then(
        (res) => (Array.isArray(res) ? res.length : Number(res)),
      ),
    firstIssue: async (parent, _, { models }) =>
      await models.Issue.findOne({
        where: { fk_series: (parent as SeriesParent).id },
        order: [['number', 'ASC']],
      }),
    lastIssue: async (parent, _, { models }) =>
      await models.Issue.findOne({
        where: { fk_series: (parent as SeriesParent).id },
        order: [['number', 'DESC']],
      }),
    lastEdited: async (parent, { limit }, { models }) =>
      await models.Issue.findAll({
        where: { fk_series: (parent as SeriesParent).id },
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      }),
    active: (parent) => !(parent as SeriesParent).endyear || (parent as SeriesParent).endyear === 0,
  },
};
