import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { HeaderMap } from '@apollo/server';
import { GraphQLError } from 'graphql';
import { merge } from 'lodash';
import models from '../models';
import DataLoader from 'dataloader';
import { resolver } from 'graphql-sequelize';
import logger from '../util/logger';
import { Transaction } from 'sequelize';
import { IncomingMessage } from 'http';
import type { ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import http from 'http';
import { parse as parseUrl } from 'url';

import { resolvers as PublisherResolvers } from '../modules/publisher/Publisher.resolver';
import { resolvers as SeriesResolvers } from '../modules/series/Series.resolver';
import { resolvers as IssueResolvers } from '../modules/issue/Issue.resolver';
import { resolvers as StoryResolvers } from '../modules/story/Story.resolver';
import { resolvers as CoverResolvers } from '../modules/cover/Cover.resolver';
import { resolvers as ArcResolvers } from '../modules/arc/Arc.resolver';
import { resolvers as IndividualResolvers } from '../modules/individual/Individual.resolver';
import { resolvers as AppearanceResolvers } from '../modules/appearance/Appearance.resolver';
import { resolvers as UserResolvers } from '../modules/user/User.resolver';
import { resolvers as FeatureResolvers } from '../modules/feature/Feature.resolver';

import { resolvers as NodeResolvers } from '../api/Node';
import { resolvers as FilterResolvers } from '../api/Filter';
import { resolvers as ScalarResolvers } from '../api/generic';
import { typeDefs } from '../api/schema';
import { mockResolvers } from '../mock/resolvers';

import { DbModels } from '../types/db';
import { PublisherService } from '../services/PublisherService';
import { SeriesService } from '../services/SeriesService';
import { IssueService } from '../services/IssueService';
import { UserService } from '../services/UserService';
import { FilterService } from '../services/FilterService';
import { StoryService } from '../services/StoryService';

import { Publisher } from '../modules/publisher/Publisher.model';
import { Series } from '../modules/series/Series.model';
import { Issue } from '../modules/issue/Issue.model';
import { Story } from '../modules/story/Story.model';
import { Cover } from '../modules/cover/Cover.model';
import { Feature } from '../modules/feature/Feature.model';

// resolver.contextToOptions = { dataloader: EXPECTED_OPTIONS_KEY };

const resolvers = merge(
  ScalarResolvers,
  NodeResolvers,
  FilterResolvers,
  UserResolvers,
  PublisherResolvers,
  SeriesResolvers,
  IssueResolvers,
  StoryResolvers,
  CoverResolvers,
  ArcResolvers,
  IndividualResolvers,
  AppearanceResolvers,
  FeatureResolvers,
);

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
const allowedCorsOrigins =
  configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultCorsOrigins;
const allowedCorsMethods = 'GET,POST,OPTIONS';
const allowedCorsHeaders = 'content-type,authorization';

export interface Context {
  loggedIn: boolean;
  authenticatedUserId?: number;
  authenticatedSessionId?: string;
  operationName: string;
  requestId: string;
  now: Date;
  response?: ServerResponse;
  models: DbModels;
  transaction?: Transaction;
  publisherService: PublisherService;
  seriesService: SeriesService;
  issueService: IssueService;
  userService: UserService;
  filterService: FilterService;
  storyService: StoryService;
  publisherLoader: DataLoader<number, Publisher | null>;
  seriesLoader: DataLoader<number, Series | null>;
  issueLoader: DataLoader<number, Issue | null>;
  storyLoader: DataLoader<number, Story | null>;
  storyChildrenLoader: DataLoader<number, Story[]>;
  storyReprintsLoader: DataLoader<number, Story[]>;
  issueStoriesLoader: DataLoader<number, Story[]>;
  issueCoverLoader: DataLoader<number, Cover | null>;
  issueCoversLoader: DataLoader<number, Cover[]>;
  issueFeaturesLoader: DataLoader<number, Feature[]>;
  issueVariantsLoader: DataLoader<string, Issue[]>;
}

type RequestWithBody = IncomingMessage & {
  body?: {
    operationName?: string;
    query?: string;
  } | null;
};

const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rawValueParts] = part.trim().split('=');
    if (!rawName) return acc;
    const rawValue = rawValueParts.join('=');
    try {
      acc[rawName] = decodeURIComponent(rawValue || '');
    } catch {
      acc[rawName] = rawValue || '';
    }
    return acc;
  }, {});
};

const parseSessionToken = (token: string | undefined): { userId: number; sessionid: string } | null => {
  if (!token) return null;
  let [userid, sessionid] = token.split(/:(.+)/);
  if (!userid || !sessionid) return null;

  userid = userid.trim().replace(/^"|"$/g, '');
  sessionid = sessionid.trim().replace(/^"|"$/g, '');
  const userId = parseInt(userid, 10);
  if (!Number.isFinite(userId) || userId <= 0 || !sessionid) return null;
  return { userId, sessionid };
};

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true;
  return allowedCorsOrigins.includes(origin);
};

const applyCorsHeaders = (req: IncomingMessage, res: ServerResponse): boolean => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (!isOriginAllowed(origin)) return false;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', allowedCorsMethods);
  res.setHeader('Access-Control-Allow-Headers', allowedCorsHeaders);
  return true;
};

const parseJsonBody = async (req: IncomingMessage): Promise<RequestWithBody['body']> => {
  if (req.method?.toUpperCase() === 'GET') return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  const rawBody = Buffer.concat(chunks).toString('utf8').trim();
  if (!rawBody) return undefined;
  return JSON.parse(rawBody) as RequestWithBody['body'];
};

const server = new ApolloServer<Context>({
  typeDefs,
  resolvers: mockModeEnabled ? merge({}, ScalarResolvers, mockResolvers) : resolvers,
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
            if (!contextValue || !contextValue.now) return;
            const now = new Date();
            const took = (now.getTime() - contextValue.now.getTime()) / 1000;
            logger.info(
              `[<<<] [${(contextValue.operationName || 'UNKNOWN').toUpperCase()}] took ${took} seconds`,
              { requestId: contextValue.requestId },
            );
          },
        };
      },
    },
  ],
});

export const startServer = async (port = parseInt(process.env.PORT || '4000', 10)) => {
  const httpServer = http.createServer(async (req, res) => {
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

    let parsedBody: RequestWithBody['body'];
    try {
      parsedBody = await parseJsonBody(req);
    } catch {
      res.statusCode = 400;
      res.end('Invalid JSON payload');
      return;
    }

    const request = req as RequestWithBody;
    request.body = parsedBody;

    const buildContext = async (): Promise<Context> => {
      const operationName = request.body?.operationName || 'UNKNOWN';
      const requestId = randomBytes(8).toString('hex');
      const now = new Date();
      logger.info(`[>>>] [${operationName.toUpperCase()}]`, { requestId });

      if (mockModeEnabled) {
        return {
          loggedIn: true,
          authenticatedUserId: undefined,
          authenticatedSessionId: undefined,
          operationName,
          requestId,
          now,
          response: res,
          models,
          publisherService: {} as PublisherService,
          seriesService: {} as SeriesService,
          issueService: {} as IssueService,
          userService: {} as UserService,
          filterService: {} as FilterService,
          storyService: {} as StoryService,
          publisherLoader: {} as DataLoader<number, Publisher | null>,
          seriesLoader: {} as DataLoader<number, Series | null>,
          issueLoader: {} as DataLoader<number, Issue | null>,
          storyLoader: {} as DataLoader<number, Story | null>,
          storyChildrenLoader: {} as DataLoader<number, Story[]>,
          storyReprintsLoader: {} as DataLoader<number, Story[]>,
          issueStoriesLoader: {} as DataLoader<number, Story[]>,
          issueCoverLoader: {} as DataLoader<number, Cover | null>,
          issueCoversLoader: {} as DataLoader<number, Cover[]>,
          issueFeaturesLoader: {} as DataLoader<number, Feature[]>,
          issueVariantsLoader: {} as DataLoader<string, Issue[]>,
        };
      }

      let loggedIn = false;
      let authenticatedUserId: number | undefined;
      let authenticatedSessionId: string | undefined;
      const authorization =
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : request.headers.authorization?.[0];
      const cookieHeader =
        typeof request.headers.cookie === 'string' ? request.headers.cookie : request.headers.cookie?.[0];
      const parsedCookies = parseCookies(cookieHeader);

      const headerToken = authorization
        ? authorization.startsWith('Bearer ')
          ? authorization.substring(7)
          : authorization
        : undefined;
      const tokenData =
        parseSessionToken(parsedCookies[SESSION_COOKIE_NAME]) || parseSessionToken(headerToken);

      if (tokenData) {
        const user = await models.User.findOne({
          where: { id: tokenData.userId, sessionid: tokenData.sessionid },
        });
        if (user) {
          loggedIn = true;
          authenticatedUserId = tokenData.userId;
          authenticatedSessionId = tokenData.sessionid;
        }
      }

      if (authorization && !loggedIn) {
        throw new GraphQLError('Ungültige Session', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      const isMutation = !!request.body?.query && request.body.query.trim().startsWith('mutation');

      const publisherService = new PublisherService(models, requestId);
      const seriesService = new SeriesService(models, requestId);
      const issueService = new IssueService(models, requestId);
      const userService = new UserService(models, requestId);
      const filterService = new FilterService(models, requestId);
      const storyService = new StoryService(models, requestId);

      const publisherLoader = new DataLoader<number, Publisher | null>((ids) =>
        publisherService.getPublishersByIds(ids),
      );
      const seriesLoader = new DataLoader<number, Series | null>((ids) =>
        seriesService.getSeriesByIds(ids),
      );
      const issueLoader = new DataLoader<number, Issue | null>((ids) =>
        issueService.getIssuesByIds(ids),
      );
      const storyLoader = new DataLoader<number, Story | null>((ids) =>
        storyService.getStoriesByIds(ids),
      );
      const storyChildrenLoader = new DataLoader<number, Story[]>((ids) =>
        storyService.getChildrenByParentIds(ids),
      );
      const storyReprintsLoader = new DataLoader<number, Story[]>((ids) =>
        storyService.getReprintsByStoryIds(ids),
      );
      const issueStoriesLoader = new DataLoader<number, Story[]>((ids) =>
        issueService.getStoriesByIssueIds(ids),
      );
      const issueCoverLoader = new DataLoader<number, Cover | null>((ids) =>
        issueService.getPrimaryCoversByIssueIds(ids),
      );
      const issueCoversLoader = new DataLoader<number, Cover[]>((ids) =>
        issueService.getCoversByIssueIds(ids),
      );
      const issueFeaturesLoader = new DataLoader<number, Feature[]>((ids) =>
        issueService.getFeaturesByIssueIds(ids),
      );
      const issueVariantsLoader = new DataLoader<string, Issue[]>(
        (keys) => issueService.getVariantsBySeriesAndNumberKeys(keys),
        { cacheKeyFn: (key) => key },
      );

      const contextBase = {
        loggedIn,
        authenticatedUserId,
        authenticatedSessionId,
        operationName,
        requestId,
        now,
        response: res,
        models,
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
        const transaction = await models.sequelize.transaction();
        return { ...contextBase, transaction };
      }
      return contextBase;
    };

    const headers = new HeaderMap();
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
          search: parseUrl(req.url || '').search || '',
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
    } catch (e) {
      logger.error('Unhandled GraphQL transport error', {
        error: e instanceof Error ? e.message : String(e),
      });
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.addPlugin(ApolloServerPluginDrainHttpServer({ httpServer }));
  await server.start();
  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, resolve);
  });

  const url = `http://localhost:${port}/`;
  return { url, server };
};

export default server;
