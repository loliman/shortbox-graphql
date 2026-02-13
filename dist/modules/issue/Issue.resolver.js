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
        issues: async (_, { pattern, series, first, after, filter }, context) => {
            const { loggedIn, issueService } = context;
            return await issueService.findIssues(pattern || undefined, series, first || undefined, after || undefined, loggedIn, filter || undefined);
        },
        issue: async (_, { issue }, { models }) => {
            schemas_1.IssueInputSchema.parse(issue);
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
            return await issueService.getLastEdited(filter || undefined, first || undefined, after || undefined, order || undefined, direction || undefined, loggedIn);
        },
    },
    Mutation: {
        deleteIssue: async (_, { item }, context) => {
            const { loggedIn, transaction, issueService } = context;
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.IssueInputSchema.parse(item);
                await issueService.deleteIssue(item, tx);
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
        createIssue: async (_, { item }, context) => {
            const { loggedIn, transaction, issueService } = context;
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.IssueInputSchema.parse(item);
                let res = await issueService.createIssue(item, tx);
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
        editIssue: async (_, { old, item }, context) => {
            const { loggedIn, transaction, issueService } = context;
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                const tx = requireTransaction(transaction);
                schemas_1.IssueInputSchema.parse(old);
                schemas_1.IssueInputSchema.parse(item);
                let res = await issueService.editIssue(old, item, tx);
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
    Issue: {
        series: async (parent, _, { seriesLoader }) => parent.Series ||
            (await seriesLoader.load(parent.fk_series)),
        stories: async (parent, _, { issueStoriesLoader }) => await issueStoriesLoader.load(parent.id),
        cover: async (parent, _, { issueCoverLoader }) => await issueCoverLoader.load(parent.id),
        covers: async (parent, _, { issueCoversLoader }) => await issueCoversLoader.load(parent.id),
        individuals: async (parent) => parent.getIndividuals
            ? await parent.getIndividuals?.()
            : [],
        arcs: async (parent) => parent.getArcs ? await parent.getArcs?.() : [],
        features: async (parent, _, { issueFeaturesLoader }) => await issueFeaturesLoader.load(parent.id),
        variants: async (parent, _, { issueVariantsLoader }) => await issueVariantsLoader.load(`${parent.fk_series}::${parent.number}`),
    },
};
