import { createFilterQuery } from '../../api/Filter';
import { Sequelize, Op } from 'sequelize';
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    series: async (_: any, { pattern, publisher, offset, limit, filter }: any, context: any) => {
      const { loggedIn, models } = context;

      if (!filter) {
        let options: any = {
          order: [
            [Sequelize.fn('sortabletitle', Sequelize.col('title')), 'ASC'],
            ['volume', 'ASC'],
          ],
          include: [{ model: models.Publisher }],
        };

        if (offset !== undefined) {
          options.offset = offset;
          options.limit = limit || 50;
        }

        if (publisher.name !== '*') options.where = { '$Publisher.name$': publisher.name };

        if (publisher.us !== undefined)
          options.where = { ...options.where, '$Publisher.original$': publisher.us ? 1 : 0 };

        if (pattern && pattern !== '') {
          options.where.title = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
          options.order = [
            [
              Sequelize.literal(
                'CASE ' +
                  "   WHEN title LIKE '" +
                  pattern +
                  "' THEN 1 " +
                  "   WHEN title LIKE '" +
                  pattern +
                  "%' THEN 2 " +
                  "   WHEN title LIKE '%" +
                  pattern +
                  "' THEN 4 " +
                  '   ELSE 3 ' +
                  'END',
              ),
              'ASC',
            ],
            ['volume', 'ASC'],
          ];
        }

        return await models.Series.findAll(options);
      } else {
        let rawQuery = createFilterQuery(loggedIn, publisher.us, filter, offset);
        let res = await models.sequelize.query(rawQuery);
        return res[0].map((s: any) => ({
          title: s.seriestitle,
          volume: s.seriesvolume,
          startyear: s.seriesstartyear,
          endyear: s.seriesendyear,
          fk_publisher: s.publisherid,
        }));
      }
    },
    seriesd: async (_: any, { series }: any, { models }: any) =>
      await models.Series.findOne({
        where: {
          title: series.title || '',
          volume: series.volume || 0,
          '$Publisher.name$': series.publisher.name || '',
        },
        include: [{ model: models.Publisher }],
      }),
  },
  Mutation: {
    deleteSeries: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: item.publisher.name.trim() },
          transaction,
        });

        let series = await models.Series.findOne({
          where: { title: item.title.trim(), volume: item.volume, fk_publisher: pub.id },
          transaction,
        });

        // Wir rufen die Instanzmethode auf, die wir im neuen Model definiert haben
        let del = await series.deleteInstance(transaction, models);

        await transaction.commit();
        return del === 1;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
    createSeries: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: item.publisher.name.trim() },
          transaction,
        });

        let res = await models.Series.create(
          {
            title: item.title.trim(),
            volume: item.volume,
            startyear: item.startyear,
            endyear: item.endyear,
            addinfo: item.addinfo,
            fk_publisher: pub.id,
          },
          { transaction },
        );

        await transaction.commit();
        return res;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
    editSeries: async (_: any, { old, item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: old.publisher.name.trim() },
          transaction,
        });

        let res = await models.Series.findOne({
          where: { title: old.title.trim(), volume: old.volume, fk_publisher: pub.id },
          transaction,
        });

        res.title = item.title.trim();
        res.volume = item.volume;
        res.startyear = item.startyear;
        res.endyear = item.endyear;
        res.addinfo = item.addinfo;
        res = await res.save({ transaction });

        await transaction.commit();
        return res;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
  },
  Series: {
    publisher: async (parent: any, _: any, { models }: any) =>
      parent.Publisher || (await models.Publisher.findByPk(parent.fk_publisher)),
    issueCount: async (parent: any, _: any, { models }: any) =>
      await models.Issue.count({ where: { fk_series: parent.id }, group: ['number'] }).then(
        (res: any) => res.length,
      ),
    firstIssue: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findOne({ where: { fk_series: parent.id }, order: [['number', 'ASC']] }),
    lastIssue: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findOne({ where: { fk_series: parent.id }, order: [['number', 'DESC']] }),
    lastEdited: async (parent: any, { limit }: any, { models }: any) =>
      await models.Issue.findAll({
        where: { fk_series: parent.id },
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      }),
    active: (parent: any) => !parent.endyear || parent.endyear === 0,
  },
};
