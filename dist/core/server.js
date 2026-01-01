"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const graphql_1 = require("graphql");
const lodash_1 = require("lodash");
const models_1 = __importDefault(require("../models"));
const dataloader_1 = __importDefault(require("dataloader"));
const logger_1 = __importDefault(require("../util/logger"));
// Import New Modular Schemas and Resolvers
const Publisher_schema_1 = require("../modules/publisher/Publisher.schema");
const Publisher_resolver_1 = require("../modules/publisher/Publisher.resolver");
const Series_schema_1 = require("../modules/series/Series.schema");
const Series_resolver_1 = require("../modules/series/Series.resolver");
const Issue_schema_1 = require("../modules/issue/Issue.schema");
const Issue_resolver_1 = require("../modules/issue/Issue.resolver");
const Story_schema_1 = require("../modules/story/Story.schema");
const Story_resolver_1 = require("../modules/story/Story.resolver");
const Cover_schema_1 = require("../modules/cover/Cover.schema");
const Cover_resolver_1 = require("../modules/cover/Cover.resolver");
const Arc_schema_1 = require("../modules/arc/Arc.schema");
const Arc_resolver_1 = require("../modules/arc/Arc.resolver");
const Individual_schema_1 = require("../modules/individual/Individual.schema");
const Individual_resolver_1 = require("../modules/individual/Individual.resolver");
const Appearance_schema_1 = require("../modules/appearance/Appearance.schema");
const Appearance_resolver_1 = require("../modules/appearance/Appearance.resolver");
const User_schema_1 = require("../modules/user/User.schema");
const User_resolver_1 = require("../modules/user/User.resolver");
const Feature_schema_1 = require("../modules/feature/Feature.schema");
const Feature_resolver_1 = require("../modules/feature/Feature.resolver");
// Import remaining TypeDefs/Resolvers (now in api/)
const Node_1 = require("../api/Node");
const Filter_1 = require("../api/Filter");
const generic_1 = require("../api/generic");
const PublisherService_1 = require("../services/PublisherService");
const SeriesService_1 = require("../services/SeriesService");
const IssueService_1 = require("../services/IssueService");
const UserService_1 = require("../services/UserService");
const FilterService_1 = require("../services/FilterService");
const StoryService_1 = require("../services/StoryService");
// resolver.contextToOptions = { dataloader: EXPECTED_OPTIONS_KEY };
const typeDefs = [
    generic_1.typeDef,
    Node_1.typeDef,
    Filter_1.typeDef,
    User_schema_1.typeDef,
    Publisher_schema_1.typeDef,
    Series_schema_1.typeDef,
    Issue_schema_1.typeDef,
    Story_schema_1.typeDef,
    Cover_schema_1.typeDef,
    Arc_schema_1.typeDef,
    Individual_schema_1.typeDef,
    Appearance_schema_1.typeDef,
    Feature_schema_1.typeDef,
];
const resolvers = (0, lodash_1.merge)(generic_1.resolvers, Node_1.resolvers, Filter_1.resolvers, User_resolver_1.resolvers, Publisher_resolver_1.resolvers, Series_resolver_1.resolvers, Issue_resolver_1.resolvers, Story_resolver_1.resolvers, Cover_resolver_1.resolvers, Arc_resolver_1.resolvers, Individual_resolver_1.resolvers, Appearance_resolver_1.resolvers, Feature_resolver_1.resolvers);
const server = new server_1.ApolloServer({
    typeDefs,
    resolvers,
    formatError: (formattedError, error) => {
        // Return a safe error object to avoid Apollo Server internal crash
        return {
            ...formattedError,
            message: formattedError.message || 'Internal server error',
            extensions: {
                ...formattedError.extensions,
                code: formattedError.extensions?.code || 'INTERNAL_SERVER_ERROR',
            },
        };
    },
    plugins: [
        {
            async requestDidStart(requestContext) {
                return {
                    async willSendResponse(requestContext) {
                        const { contextValue } = requestContext;
                        if (!contextValue || !contextValue.now)
                            return;
                        let now = new Date();
                        let took = (now.getTime() - contextValue.now.getTime()) / 1000;
                        logger_1.default.info(`[<<<] [${(contextValue.operationName || 'UNKNOWN').toUpperCase()}] took ${took} seconds`, { requestId: contextValue.requestId });
                    },
                };
            },
        },
    ],
});
const startServer = async (port = parseInt(process.env.PORT || '4000', 10)) => {
    const { url } = await (0, standalone_1.startStandaloneServer)(server, {
        context: async ({ req }) => {
            let operationName = req.body.operationName || 'UNKNOWN';
            let requestId = Math.random().toString(36).substring(2, 15);
            let now = new Date();
            logger_1.default.info(`[>>>] [${operationName.toUpperCase()}]`, { requestId });
            let loggedIn = false;
            if (req.headers.authorization) {
                let auth = req.headers.authorization;
                if (auth.startsWith('Bearer ')) {
                    auth = auth.substring(7);
                }
                let [userid, sessionid] = auth.split(/:(.+)/);
                if (userid && sessionid) {
                    userid = userid.trim().replace(/^"|"$/g, '');
                    sessionid = sessionid.trim().replace(/^"|"$/g, '');
                    let user = await models_1.default.User.findOne({
                        where: { id: parseInt(userid, 10) || 0, sessionid: sessionid },
                    });
                    if (user)
                        loggedIn = true;
                }
                if (!loggedIn)
                    throw new graphql_1.GraphQLError('Ungültige Session', {
                        extensions: { code: 'UNAUTHENTICATED' },
                    });
            }
            let isMutation = req.body.query && req.body.query.trim().startsWith('mutation');
            const publisherService = new PublisherService_1.PublisherService(models_1.default, requestId);
            const seriesService = new SeriesService_1.SeriesService(models_1.default, requestId);
            const issueService = new IssueService_1.IssueService(models_1.default, requestId);
            const userService = new UserService_1.UserService(models_1.default, requestId);
            const filterService = new FilterService_1.FilterService(models_1.default, requestId);
            const storyService = new StoryService_1.StoryService(models_1.default, requestId);
            const publisherLoader = new dataloader_1.default((ids) => publisherService.getPublishersByIds(ids));
            const seriesLoader = new dataloader_1.default((ids) => seriesService.getSeriesByIds(ids));
            const issueLoader = new dataloader_1.default((ids) => issueService.getIssuesByIds(ids));
            const storyLoader = new dataloader_1.default((ids) => storyService.getStoriesByIds(ids));
            const contextBase = {
                loggedIn,
                operationName,
                requestId,
                now,
                models: models_1.default,
                publisherService,
                seriesService,
                issueService,
                userService,
                filterService,
                storyService,
                publisherLoader,
                seriesLoader,
                issueLoader,
                storyLoader,
            };
            if (isMutation) {
                const transaction = await models_1.default.sequelize.transaction();
                return { ...contextBase, transaction };
            }
            return contextBase;
        },
        listen: { port },
    });
    return { url, server };
};
exports.startServer = startServer;
exports.default = server;
