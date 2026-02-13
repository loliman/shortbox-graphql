"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const server_1 = require("@apollo/server");
const drainHttpServer_1 = require("@apollo/server/plugin/drainHttpServer");
const server_2 = require("@apollo/server");
const graphql_1 = require("graphql");
const lodash_1 = require("lodash");
const models_1 = __importDefault(require("../models"));
const dataloader_1 = __importDefault(require("dataloader"));
const logger_1 = __importDefault(require("../util/logger"));
const crypto_1 = require("crypto");
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const Publisher_resolver_1 = require("../modules/publisher/Publisher.resolver");
const Series_resolver_1 = require("../modules/series/Series.resolver");
const Issue_resolver_1 = require("../modules/issue/Issue.resolver");
const Story_resolver_1 = require("../modules/story/Story.resolver");
const Cover_resolver_1 = require("../modules/cover/Cover.resolver");
const Arc_resolver_1 = require("../modules/arc/Arc.resolver");
const Individual_resolver_1 = require("../modules/individual/Individual.resolver");
const Appearance_resolver_1 = require("../modules/appearance/Appearance.resolver");
const User_resolver_1 = require("../modules/user/User.resolver");
const Feature_resolver_1 = require("../modules/feature/Feature.resolver");
const Node_1 = require("../api/Node");
const Filter_1 = require("../api/Filter");
const generic_1 = require("../api/generic");
const schema_1 = require("../api/schema");
const resolvers_1 = require("../mock/resolvers");
const PublisherService_1 = require("../services/PublisherService");
const SeriesService_1 = require("../services/SeriesService");
const IssueService_1 = require("../services/IssueService");
const UserService_1 = require("../services/UserService");
const FilterService_1 = require("../services/FilterService");
const StoryService_1 = require("../services/StoryService");
// resolver.contextToOptions = { dataloader: EXPECTED_OPTIONS_KEY };
const resolvers = (0, lodash_1.merge)(generic_1.resolvers, Node_1.resolvers, Filter_1.resolvers, User_resolver_1.resolvers, Publisher_resolver_1.resolvers, Series_resolver_1.resolvers, Issue_resolver_1.resolvers, Story_resolver_1.resolvers, Cover_resolver_1.resolvers, Arc_resolver_1.resolvers, Individual_resolver_1.resolvers, Appearance_resolver_1.resolvers, Feature_resolver_1.resolvers);
const mockModeEnabled = (process.env.MOCK_MODE || '').toLowerCase() === 'true';
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sb_session';
const defaultCorsOrigins = [
    'https://shortbox.de',
    'https://www.shortbox.de',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedCorsOrigins = configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultCorsOrigins;
const allowedCorsMethods = 'GET,POST,OPTIONS';
const allowedCorsHeaders = 'content-type,authorization';
const parseCookies = (cookieHeader) => {
    if (!cookieHeader)
        return {};
    return cookieHeader.split(';').reduce((acc, part) => {
        const [rawName, ...rawValueParts] = part.trim().split('=');
        if (!rawName)
            return acc;
        const rawValue = rawValueParts.join('=');
        try {
            acc[rawName] = decodeURIComponent(rawValue || '');
        }
        catch {
            acc[rawName] = rawValue || '';
        }
        return acc;
    }, {});
};
const parseSessionToken = (token) => {
    if (!token)
        return null;
    let [userid, sessionid] = token.split(/:(.+)/);
    if (!userid || !sessionid)
        return null;
    userid = userid.trim().replace(/^"|"$/g, '');
    sessionid = sessionid.trim().replace(/^"|"$/g, '');
    const userId = parseInt(userid, 10);
    if (!Number.isFinite(userId) || userId <= 0 || !sessionid)
        return null;
    return { userId, sessionid };
};
const isOriginAllowed = (origin) => {
    if (!origin)
        return true;
    return allowedCorsOrigins.includes(origin);
};
const applyCorsHeaders = (req, res) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (!isOriginAllowed(origin))
        return false;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', allowedCorsMethods);
    res.setHeader('Access-Control-Allow-Headers', allowedCorsHeaders);
    return true;
};
const parseJsonBody = async (req) => {
    if (req.method?.toUpperCase() === 'GET')
        return undefined;
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0)
        return undefined;
    const rawBody = Buffer.concat(chunks).toString('utf8').trim();
    if (!rawBody)
        return undefined;
    return JSON.parse(rawBody);
};
const server = new server_1.ApolloServer({
    typeDefs: schema_1.typeDefs,
    resolvers: mockModeEnabled ? (0, lodash_1.merge)({}, generic_1.resolvers, resolvers_1.mockResolvers) : resolvers,
    formatError: (formattedError) => {
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
            async requestDidStart() {
                return {
                    async willSendResponse(requestContext) {
                        const contextValue = requestContext.contextValue;
                        if (!contextValue || !contextValue.now)
                            return;
                        const now = new Date();
                        const took = (now.getTime() - contextValue.now.getTime()) / 1000;
                        logger_1.default.info(`[<<<] [${(contextValue.operationName || 'UNKNOWN').toUpperCase()}] took ${took} seconds`, { requestId: contextValue.requestId });
                    },
                };
            },
        },
    ],
});
const startServer = async (port = parseInt(process.env.PORT || '4000', 10)) => {
    const httpServer = http_1.default.createServer(async (req, res) => {
        const corsAllowed = applyCorsHeaders(req, res);
        if (!corsAllowed) {
            res.statusCode = 403;
            res.end('CORS origin denied');
            return;
        }
        if (req.method?.toUpperCase() === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
        }
        if (req.method?.toUpperCase() !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Allow', 'POST,OPTIONS');
            res.end('Method not allowed');
            return;
        }
        let parsedBody;
        try {
            parsedBody = await parseJsonBody(req);
        }
        catch {
            res.statusCode = 400;
            res.end('Invalid JSON payload');
            return;
        }
        const request = req;
        request.body = parsedBody;
        const buildContext = async () => {
            const operationName = request.body?.operationName || 'UNKNOWN';
            const requestId = (0, crypto_1.randomBytes)(8).toString('hex');
            const now = new Date();
            logger_1.default.info(`[>>>] [${operationName.toUpperCase()}]`, { requestId });
            if (mockModeEnabled) {
                return {
                    loggedIn: true,
                    authenticatedUserId: undefined,
                    authenticatedSessionId: undefined,
                    operationName,
                    requestId,
                    now,
                    response: res,
                    models: models_1.default,
                    publisherService: {},
                    seriesService: {},
                    issueService: {},
                    userService: {},
                    filterService: {},
                    storyService: {},
                    publisherLoader: {},
                    seriesLoader: {},
                    issueLoader: {},
                    storyLoader: {},
                    storyChildrenLoader: {},
                    storyReprintsLoader: {},
                    issueStoriesLoader: {},
                    issueCoverLoader: {},
                    issueCoversLoader: {},
                    issueFeaturesLoader: {},
                    issueVariantsLoader: {},
                };
            }
            let loggedIn = false;
            let authenticatedUserId;
            let authenticatedSessionId;
            const authorization = typeof request.headers.authorization === 'string'
                ? request.headers.authorization
                : request.headers.authorization?.[0];
            const cookieHeader = typeof request.headers.cookie === 'string' ? request.headers.cookie : request.headers.cookie?.[0];
            const parsedCookies = parseCookies(cookieHeader);
            const headerToken = authorization
                ? authorization.startsWith('Bearer ')
                    ? authorization.substring(7)
                    : authorization
                : undefined;
            const tokenData = parseSessionToken(parsedCookies[SESSION_COOKIE_NAME]) || parseSessionToken(headerToken);
            if (tokenData) {
                const user = await models_1.default.User.findOne({
                    where: { id: tokenData.userId, sessionid: tokenData.sessionid },
                });
                if (user) {
                    loggedIn = true;
                    authenticatedUserId = tokenData.userId;
                    authenticatedSessionId = tokenData.sessionid;
                }
            }
            if (authorization && !loggedIn) {
                throw new graphql_1.GraphQLError('Ungültige Session', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            }
            const isMutation = !!request.body?.query && request.body.query.trim().startsWith('mutation');
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
            const storyChildrenLoader = new dataloader_1.default((ids) => storyService.getChildrenByParentIds(ids));
            const storyReprintsLoader = new dataloader_1.default((ids) => storyService.getReprintsByStoryIds(ids));
            const issueStoriesLoader = new dataloader_1.default((ids) => issueService.getStoriesByIssueIds(ids));
            const issueCoverLoader = new dataloader_1.default((ids) => issueService.getPrimaryCoversByIssueIds(ids));
            const issueCoversLoader = new dataloader_1.default((ids) => issueService.getCoversByIssueIds(ids));
            const issueFeaturesLoader = new dataloader_1.default((ids) => issueService.getFeaturesByIssueIds(ids));
            const issueVariantsLoader = new dataloader_1.default((keys) => issueService.getVariantsBySeriesAndNumberKeys(keys), { cacheKeyFn: (key) => key });
            const contextBase = {
                loggedIn,
                authenticatedUserId,
                authenticatedSessionId,
                operationName,
                requestId,
                now,
                response: res,
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
                storyChildrenLoader,
                storyReprintsLoader,
                issueStoriesLoader,
                issueCoverLoader,
                issueCoversLoader,
                issueFeaturesLoader,
                issueVariantsLoader,
            };
            if (isMutation) {
                const transaction = await models_1.default.sequelize.transaction();
                return { ...contextBase, transaction };
            }
            return contextBase;
        };
        const headers = new server_2.HeaderMap();
        for (const [key, value] of Object.entries(req.headers)) {
            if (value !== undefined) {
                headers.set(key, Array.isArray(value) ? value.join(', ') : value);
            }
        }
        try {
            const httpGraphQLResponse = await server.executeHTTPGraphQLRequest({
                httpGraphQLRequest: {
                    method: req.method.toUpperCase(),
                    headers,
                    search: (0, url_1.parse)(req.url || '').search || '',
                    body: request.body || undefined,
                },
                context: buildContext,
            });
            for (const [key, value] of httpGraphQLResponse.headers) {
                res.setHeader(key, value);
            }
            res.statusCode = httpGraphQLResponse.status || 200;
            if (httpGraphQLResponse.body.kind === 'complete') {
                res.end(httpGraphQLResponse.body.string);
                return;
            }
            for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
                res.write(chunk);
            }
            res.end();
        }
        catch (e) {
            logger_1.default.error('Unhandled GraphQL transport error', {
                error: e instanceof Error ? e.message : String(e),
            });
            res.statusCode = 500;
            res.end('Internal server error');
        }
    });
    server.addPlugin((0, drainHttpServer_1.ApolloServerPluginDrainHttpServer)({ httpServer }));
    await server.start();
    await new Promise((resolve) => {
        httpServer.listen({ port }, resolve);
    });
    const url = `http://localhost:${port}/`;
    return { url, server };
};
exports.startServer = startServer;
exports.default = server;
