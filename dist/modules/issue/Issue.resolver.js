"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const graphql_1 = require("graphql");
const schemas_1 = require("../../types/schemas");
exports.resolvers = {
    Query: {
        issues: async (_, { pattern, series, first, after, filter }, context) => {
            const { loggedIn, issueService } = context;
            return (await issueService.findIssues(pattern || undefined, series, first || undefined, after || undefined, loggedIn, filter || undefined));
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
                schemas_1.IssueInputSchema.parse(item);
                await issueService.deleteIssue(item, transaction);
                await transaction.commit();
                return true;
            }
            catch (e) {
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
                schemas_1.IssueInputSchema.parse(item);
                let res = await issueService.createIssue(item, transaction);
                await transaction.commit();
                return res;
            }
            catch (e) {
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
                schemas_1.IssueInputSchema.parse(old);
                schemas_1.IssueInputSchema.parse(item);
                let res = await issueService.editIssue(old, item, transaction);
                await transaction.commit();
                return res;
            }
            catch (e) {
                await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
                }
                throw e;
            }
        },
    },
    Issue: {
        series: async (parent, _, { seriesLoader }) => parent.Series || (await seriesLoader.load(parent.fk_series)),
        stories: async (parent, _, { models }) => (await models.Story.findAll({
            where: { fk_issue: parent.id },
            order: [['number', 'ASC']],
        })),
        cover: async (parent, _, { models }) => (await models.Cover.findOne({ where: { fk_issue: parent.id, number: 0 } })),
        covers: async (parent, _, { models }) => (await models.Cover.findAll({
            where: { fk_issue: parent.id },
            order: [['number', 'ASC']],
        })),
        individuals: async (parent) => parent.getIndividuals ? await parent.getIndividuals() : [],
        arcs: async (parent) => (parent.getArcs ? await parent.getArcs() : []),
        features: async (parent, _, { models }) => (await models.Feature.findAll({ where: { fk_issue: parent.id } })),
        variants: async (parent, _, { models }) => (await models.Issue.findAll({
            where: { fk_series: parent.fk_series, number: parent.number },
            order: [['variant', 'ASC']],
        })),
    },
};
