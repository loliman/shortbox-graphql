import { SeriesService } from '../../services/SeriesService';
import { GraphQLError } from 'graphql';
import { SeriesResolvers } from '../../types/graphql';
import { SeriesInputSchema } from '../../types/schemas';

type SeriesParent = {
  id: number;
  fk_publisher: number;
  endyear?: number | null;
  publisher?: unknown;
  Publisher?: unknown;
};

type LoaderLike<K, V> = {
  load: (key: K) => Promise<V>;
};

const hasLoad = <K, V>(loader: unknown): loader is LoaderLike<K, V> =>
  Boolean(loader) && typeof (loader as { load?: unknown }).load === 'function';

export const resolvers: SeriesResolvers = {
  Query: {
    seriesList: async (_, { pattern, publisher, first, after, filter }, context) => {
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
    seriesDetails: async (_, { series }, { models }) => {
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
      const { loggedIn, models, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          await seriesService.deleteSeries(item, tx);
          return true;
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    createSeries: async (_, { item }, context) => {
      const { loggedIn, models, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await seriesService.createSeries(item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    editSeries: async (_, { old, item }, context) => {
      const { loggedIn, models, seriesService } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        SeriesInputSchema.parse(old);
        SeriesInputSchema.parse(item);
        return await models.sequelize.transaction(async (tx) => {
          return await seriesService.editSeries(old, item, tx);
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  Series: {
    publisher: async (parent, _, { publisherLoader }) => {
      const seriesParent = parent as SeriesParent;
      if (seriesParent.Publisher) return seriesParent.Publisher;
      if (seriesParent.publisher) return seriesParent.publisher;
      if (!hasLoad<number, unknown | null>(publisherLoader)) return null;
      return await publisherLoader.load(seriesParent.fk_publisher);
    },
    issueCount: async (parent, _, { models }) =>
      await models.Issue.count({
        where: { fk_series: (parent as SeriesParent).id },
        group: ['number'],
      }).then((res) => (Array.isArray(res) ? res.length : Number(res))),
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
        order: [['updatedat', 'DESC']],
        limit: limit || 25,
      }),
    active: (parent) => !(parent as SeriesParent).endyear || (parent as SeriesParent).endyear === 0,
  },
};
