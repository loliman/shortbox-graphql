import { createFilterQuery } from '../../api/Filter';
import { Op } from 'sequelize';
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    issues: async (_: any, { pattern, series, offset, limit, filter }: any, context: any) => {
      const { loggedIn, models } = context;

      if (!filter) {
        let options: any = {
          order: [
            ['number', 'ASC'],
            ['variant', 'ASC'],
          ],
          include: [
            {
              model: models.Series,
              where: { title: series.title, volume: series.volume },
              include: [
                {
                  model: models.Publisher,
                  where: { name: series.publisher.name },
                },
              ],
            },
          ],
        };

        if (offset !== undefined) {
          options.offset = offset;
          options.limit = limit || 50;
        }

        if (pattern && pattern !== '') {
          options.where = {
            ...options.where,
            [Op.or]: [
              { number: { [Op.like]: pattern + '%' } },
              { title: { [Op.like]: '%' + pattern + '%' } },
            ],
          };
        }

        return await models.Issue.findAll(options);
      } else {
        let rawQuery = createFilterQuery(loggedIn, series.publisher.us, filter, offset);
        let res = await models.sequelize.query(rawQuery);
        return res[0].map((i: any) => ({
          id: i.issueid,
          number: i.issuenumber,
          title: i.issuetitle,
          format: i.issueformat,
          variant: i.issuevariant,
          releasedate: i.issuereleasedate,
          pages: i.issuepages,
          price: i.issueprice,
          currency: i.issuecurrency,
        }));
      }
    },
    issue: async (_: any, { issue, edit }: any, { models }: any) =>
      await models.Issue.findOne({
        where: { number: issue.number || '', variant: issue.variant || '' },
        include: [
          {
            model: models.Series,
            where: { title: issue.series.title, volume: issue.series.volume },
            include: [
              {
                model: models.Publisher,
                where: { name: issue.series.publisher.name },
              },
            ],
          },
        ],
      }),
    lastEdited: async (_: any, { filter, offset, limit, order, direction }: any, { models }: any) => {
      let options: any = {
        order: [[order || 'updatedAt', direction || 'DESC']],
        limit: limit || 25,
        offset: offset || 0,
        include: [
          {
            model: models.Series,
            include: [{ model: models.Publisher }],
          },
        ],
      };

      if (filter) {
        if (filter.us !== undefined) {
          options.include[0].include[0].where = { original: filter.us ? 1 : 0 };
        }
        if (filter.publishers && filter.publishers.length > 0) {
          options.include[0].include[0].where = {
            ...options.include[0].include[0].where,
            name: filter.publishers[0].name,
          };
        }
        if (filter.series && filter.series.length > 0) {
          options.include[0].where = {
            ...options.include[0].where,
            title: filter.series[0].title,
            volume: filter.series[0].volume,
          };
        }
      }

      return await models.Issue.findAll(options);
    },
  },
  Mutation: {
    deleteIssue: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: item.series.publisher.name.trim() },
          transaction,
        });
        let series = await models.Series.findOne({
          where: {
            title: item.series.title.trim(),
            volume: item.series.volume,
            fk_publisher: pub.id,
          },
          transaction,
        });
        let issue = await models.Issue.findOne({
          where: {
            number: item.number ? item.number.trim() : '',
            variant: item.variant ? item.variant.trim() : '',
            fk_series: series.id,
          },
          transaction,
        });

        let del = await issue.deleteInstance(transaction, models);
        await transaction.commit();
        return del === 1;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
    createIssue: async (_: any, { item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: item.series.publisher.name.trim() },
          transaction,
        });
        let series = await models.Series.findOne({
          where: {
            title: item.series.title.trim(),
            volume: item.series.volume,
            fk_publisher: pub.id,
          },
          transaction,
        });

        let res = await models.Issue.create(
          {
            title: item.title.trim(),
            number: item.number.trim(),
            format: item.format,
            variant: item.variant.trim(),
            releasedate: item.releasedate,
            pages: item.pages,
            price: item.price,
            currency: item.currency,
            fk_series: series.id,
            isbn: item.isbn,
            limitation: item.limitation,
            addinfo: item.addinfo,
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
    editIssue: async (_: any, { old, item }: any, context: any) => {
      const { loggedIn, transaction, models } = context;
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        let pub = await models.Publisher.findOne({
          where: { name: old.series.publisher.name.trim() },
          transaction,
        });
        let series = await models.Series.findOne({
          where: {
            title: old.series.title.trim(),
            volume: old.series.volume,
            fk_publisher: pub.id,
          },
          transaction,
        });
        let res = await models.Issue.findOne({
          where: {
            number: old.number ? old.number.trim() : '',
            variant: old.variant ? old.variant.trim() : '',
            fk_series: series.id,
          },
          transaction,
        });

        res.title = item.title.trim();
        res.number = item.number.trim();
        res.format = item.format;
        res.variant = item.variant.trim();
        res.releasedate = item.releasedate;
        res.pages = item.pages;
        res.price = item.price;
        res.currency = item.currency;
        res.isbn = item.isbn;
        res.limitation = item.limitation;
        res.addinfo = item.addinfo;
        res.verified = item.verified;
        res.collected = item.collected;
        res.comicguideid = item.comicguideid;

        res = await res.save({ transaction });

        await transaction.commit();
        return res;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
  },
  Issue: {
    series: async (parent: any, _: any, { models }: any) =>
      parent.Series || (await models.Series.findByPk(parent.fk_series)),
    stories: async (parent: any, _: any, { models }: any) =>
      await models.Story.findAll({ where: { fk_issue: parent.id }, order: [['number', 'ASC']] }),
    cover: async (parent: any, _: any, { models }: any) =>
      await models.Cover.findOne({ where: { fk_issue: parent.id, number: 0 } }),
    covers: async (parent: any, _: any, { models }: any) =>
      await models.Cover.findAll({ where: { fk_issue: parent.id }, order: [['number', 'ASC']] }),
    individuals: async (parent: any, _: any, { models }: any) =>
      parent.getIndividuals ? await parent.getIndividuals() : [],
    arcs: async (parent: any, _: any, { models }: any) =>
      parent.getArcs ? await parent.getArcs() : [],
    features: async (parent: any, _: any, { models }: any) =>
      await models.Feature.findAll({ where: { fk_issue: parent.id } }),
    variants: async (parent: any, _: any, { models }: any) =>
      await models.Issue.findAll({
        where: { fk_series: parent.fk_series, number: parent.number },
        order: [['variant', 'ASC']],
      }),
  },
};
