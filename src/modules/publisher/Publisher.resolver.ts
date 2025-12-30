import { createFilterQuery } from '../../api/Filter';
import { Sequelize, Op } from 'sequelize';
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    publishers: async (_: any, { pattern, us, offset, limit, filter }: any, context: any) => {
      const { loggedIn, models } = context;

      if (!filter) {
        let options: any = {
          order: [['name', 'ASC']],
          where: { original: us },
        };

        if (offset !== undefined) {
          options.offset = offset;
          options.limit = limit || 50;
        }

        if (pattern && pattern !== '') {
          options.where.name = { [Op.like]: '%' + pattern.replace(/\s/g, '%') + '%' };
          options.order = [
            [
              Sequelize.literal(
                'CASE ' +
                  "   WHEN name LIKE '" +
                  pattern +
                  "' THEN 1 " +
                  "   WHEN name LIKE '" +
                  pattern +
                  "%' THEN 2 " +
                  "   WHEN name LIKE '%" +
                  pattern +
                  "' THEN 4 " +
                  '   ELSE 3 ' +
                  'END',
              ),
              'ASC',
            ],
          ];
        }

        return await models.Publisher.findAll(options);
      } else {
        let rawQuery = createFilterQuery(loggedIn, us, filter, offset, false, false, false, false);
        let res = await models.sequelize.query(rawQuery);
        let publishers = res[0].map((p: any) => ({
          name: p.publishername,
          original: us,
        }));
        return publishers;
      }
    },
    publisher: (_: any, { publisher }: any, { models }: any) =>
      models.Publisher.findOne({
        where: {
          name: publisher.name || '',
        },
      }),
  },
  Mutation: {
    deletePublisher: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: item.name.trim() },
          transaction,
        });

        // Wir nutzen hier das Sequelize-Objekt direkt, da die .delete() Methode
        // im alten Code eine Instanzmethode war.
        // Für eine sauberere Trennung sollte dies in einen Service ausgelagert werden.
        // Hier implementieren wir die Logik direkt oder rufen eine Helper-Funktion auf.

        // Analog zur Publisher.js delete Methode:
        let series = await models.Series.findAll({
          where: { fk_publisher: pub.id },
          transaction,
        });

        for (const s of series) {
          await s.delete(transaction); // Annahme: Series hat noch die delete-Methode
        }

        let del = await pub.destroy({ transaction });
        await transaction.commit();
        return del === 1;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
    createPublisher: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let res = await models.Publisher.create(
          {
            name: item.name.trim(),
            addinfo: item.addinfo,
            original: item.us,
            startyear: item.startyear,
            endyear: item.endyear,
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
    editPublisher: async (_: any, { old, item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let res = await models.Publisher.findOne({
          where: { name: old.name.trim() },
          transaction,
        });

        res.name = item.name.trim();
        res.addinfo = item.addinfo;
        res.startyear = item.startyear;
        res.endyear = item.endyear;
        res = await res.save({ transaction });

        await transaction.commit();
        return res;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
  },
  Publisher: {
    id: (parent: any, _: any, { loggedIn }: any) => {
      if (!loggedIn) return String(new Date().getTime());
      return parent.id;
    },
    us: (parent: any) => parent.original,
    seriesCount: async (parent: any, _: any, { models }: any) =>
      await models.Series.count({ where: { fk_publisher: parent.id } }),
    issueCount: async (parent: any, _: any, { models }: any) => {
      let res = await models.Issue.findAll({
        where: { '$Series.fk_publisher$': parent.id },
        group: ['fk_series', 'number'],
        include: [{ model: models.Series }],
      });
      return res.length;
    },
    lastEdited: async (parent: any, { limit }: any, { models }: any) =>
      await models.Issue.findAll({
        include: [
          {
            model: models.Series,
            where: { fk_publisher: parent.id },
          },
        ],
        order: [['updatedAt', 'DESC']],
        limit: limit || 25,
      }),
    firstIssue: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findOne({
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
      }),
    lastIssue: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findOne({
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
      }),
    active: (parent: any) => !parent.endyear || parent.endyear === 0,
  },
};
