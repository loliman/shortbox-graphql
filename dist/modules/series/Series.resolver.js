"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const graphql_1 = require("graphql");
const schemas_1 = require("../../types/schemas");
const requireTransaction = (transaction) => {
    if (!transaction) {
        throw new graphql_1.GraphQLError('Transaktion konnte nicht erstellt werden', {
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
    }
    return transaction;
};
exports.resolvers = {
    Query: {
        series: async (_, { pattern, publisher, first, after, filter }, context) => {
            const { loggedIn, seriesService } = context;
            return await seriesService.findSeries(pattern || undefined, publisher, first || undefined, after || undefined, loggedIn, filter || undefined);
        },
        seriesd: async (_, { series }, { models }) => {
            schemas_1.SeriesInputSchema.parse(series);
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
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.SeriesInputSchema.parse(item);
                await seriesService.deleteSeries(item, tx);
                await tx.commit();
                return true;
            }
            catch (e) {
                if (transaction)
                    await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
                }
                throw e;
            }
        },
        createSeries: async (_, { item }, context) => {
            const { loggedIn, transaction, seriesService } = context;
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.SeriesInputSchema.parse(item);
                let res = await seriesService.createSeries(item, tx);
                await tx.commit();
                return res;
            }
            catch (e) {
                if (transaction)
                    await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
                }
                throw e;
            }
        },
        editSeries: async (_, { old, item }, context) => {
            const { loggedIn, transaction, seriesService } = context;
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.SeriesInputSchema.parse(old);
                schemas_1.SeriesInputSchema.parse(item);
                let res = await seriesService.editSeries(old, item, tx);
                await tx.commit();
                return res;
            }
            catch (e) {
                if (transaction)
                    await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
                }
                throw e;
            }
        },
    },
    Series: {
        publisher: async (parent, _, { publisherLoader }) => parent.Publisher ||
            (await publisherLoader.load(parent.fk_publisher)),
        issueCount: async (parent, _, { models }) => await models.Issue.count({ where: { fk_series: parent.id }, group: ['number'] }).then((res) => (Array.isArray(res) ? res.length : Number(res))),
        firstIssue: async (parent, _, { models }) => await models.Issue.findOne({
            where: { fk_series: parent.id },
            order: [['number', 'ASC']],
        }),
        lastIssue: async (parent, _, { models }) => await models.Issue.findOne({
            where: { fk_series: parent.id },
            order: [['number', 'DESC']],
        }),
        lastEdited: async (parent, { limit }, { models }) => await models.Issue.findAll({
            where: { fk_series: parent.id },
            order: [['updatedAt', 'DESC']],
            limit: limit || 25,
        }),
        active: (parent) => !parent.endyear || parent.endyear === 0,
    },
};
