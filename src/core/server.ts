import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { GraphQLError } from 'graphql';
import { applyMiddleware } from 'graphql-middleware';
import { allow, rule, shield } from 'graphql-shield';
import { merge } from 'lodash';
import models from '../models';
import DataLoader from 'dataloader';
import logger from '../util/logger';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import connectSessionSequelize from 'connect-session-sequelize';
import http from 'http';
import { randomBytes } from 'crypto';
import {
  CORS_ALLOW_ALL_ORIGINS,
  CORS_FAIL_CLOSED,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  CSRF_PROTECTION_ENABLED,
  GRAPHQL_BODY_LIMIT_BYTES,
} from './server-config';
import { type GraphQLRequestBody, parseRequestIp } from './server-request';
import { isRequestCsrfValid, issueCsrfToken } from './csrf';
import { resolveCookieSecurity, SESSION_COOKIE_NAME, sessionCookieSameSite } from './cookies';

import { resolvers as PublisherResolvers } from '../modules/publisher/Publisher.resolver';
import { resolvers as SeriesResolvers } from '../modules/series/Series.resolver';
import { resolvers as IssueResolvers } from '../modules/issue/Issue.resolver';
import { resolvers as StoryResolvers } from '../modules/story/Story.resolver';
import { resolvers as CoverResolvers } from '../modules/cover/Cover.resolver';
import { resolvers as ArcResolvers } from '../modules/arc/Arc.resolver';
import { resolvers as IndividualResolvers } from '../modules/individual/Individual.resolver';
import { resolvers as AppearanceResolvers } from '../modules/appearance/Appearance.resolver';
import { resolvers as UserResolvers } from '../modules/user/User.resolver';
import { resolvers as AdminResolvers } from '../modules/admin/Admin.resolver';

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

const resolvers = merge(
  ScalarResolvers,
  NodeResolvers,
  FilterResolvers,
  UserResolvers,
  AdminResolvers,
  PublisherResolvers,
  SeriesResolvers,
  IssueResolvers,
  StoryResolvers,
  CoverResolvers,
  ArcResolvers,
  IndividualResolvers,
  AppearanceResolvers,
);

const mockModeEnabled = (process.env.MOCK_MODE || '').toLowerCase() === 'true';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me';
const SESSION_STORE_TABLE = (process.env.SESSION_STORE_TABLE || 'sessions').toLowerCase();
const parsedSessionTtlSeconds = parseInt(process.env.SESSION_TTL_SECONDS || '1209600', 10);
const SESSION_TTL_SECONDS = Number.isFinite(parsedSessionTtlSeconds)
  ? parsedSessionTtlSeconds
  : 1209600;

const defaultCorsOrigins = [
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

const allowedSameSiteValues = ['lax', 'strict', 'none'] as const;
const configuredSessionCookieSameSite = (process.env.SESSION_COOKIE_SAME_SITE || 'lax')
  .trim()
  .toLowerCase();

const validateCorsOrigin = (origin: string): string | null => {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'must use http:// or https://';
    }
    if (parsed.username || parsed.password) {
      return 'must not include credentials';
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return 'must not include path, query, or fragment';
    }
    return null;
  } catch {
    return 'must be a valid URL';
  }
};

const validateStartupSecurityConfiguration = (
  isProduction: boolean,
  sessionCookieSecure: boolean,
) => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (SESSION_SECRET === 'dev-only-change-me') {
    const message = 'SESSION_SECRET uses fallback value';
    if (isProduction) errors.push(message);
    else warnings.push(`${message}. Configure SESSION_SECRET for shared environments.`);
  }

  if (SESSION_SECRET.length < 32) {
    const message = 'SESSION_SECRET should be at least 32 characters';
    if (isProduction) errors.push(message);
    else warnings.push(`${message} to reduce brute-force risk.`);
  }

  if (
    configuredSessionCookieSameSite.length > 0 &&
    !allowedSameSiteValues.includes(
      configuredSessionCookieSameSite as (typeof allowedSameSiteValues)[number],
    )
  ) {
    errors.push('SESSION_COOKIE_SAME_SITE must be one of: lax, strict, none');
  }

  if (CSRF_PROTECTION_ENABLED && (!CSRF_COOKIE_NAME.trim() || !CSRF_HEADER_NAME.trim())) {
    errors.push('CSRF cookie/header names must be non-empty when CSRF protection is enabled');
  }

  if (isProduction && !CSRF_PROTECTION_ENABLED) {
    errors.push('CSRF_PROTECTION_ENABLED must stay true in production');
  }

  if (CORS_ALLOW_ALL_ORIGINS) {
    const message = 'CORS_ALLOW_ALL_ORIGINS is enabled';
    if (isProduction) errors.push(`${message}. Disable this in production.`);
    else warnings.push(`${message}. Use only for local debugging.`);
  }

  if (
    isProduction &&
    !mockModeEnabled &&
    CORS_FAIL_CLOSED &&
    !CORS_ALLOW_ALL_ORIGINS &&
    configuredCorsOrigins.length === 0
  ) {
    errors.push('CORS_ORIGIN must be configured in production when CORS_FAIL_CLOSED is enabled');
  }

  const invalidCorsOrigins = configuredCorsOrigins
    .map((origin) => ({ origin, reason: validateCorsOrigin(origin) }))
    .filter((item): item is { origin: string; reason: string } => Boolean(item.reason));
  if (invalidCorsOrigins.length > 0) {
    errors.push(
      `Invalid CORS_ORIGIN entries: ${invalidCorsOrigins
        .map((item) => `"${item.origin}" (${item.reason})`)
        .join(', ')}`,
    );
  }

  if (isProduction && !sessionCookieSecure) {
    errors.push('Session cookie must be secure in production');
  }

  warnings.forEach((message) => logger.warn(message));

  if (errors.length > 0) {
    throw new Error(`Security configuration invalid:\n- ${errors.join('\n- ')}`);
  }
};

const resolveAuthenticatedUserId = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
};

export interface Context {
  loggedIn: boolean;
  authenticatedUserId?: number;
  requestIp?: string;
  operationName: string;
  requestId: string;
  now: Date;
  request?: Request;
  response?: Response;
  models: DbModels;
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
  issueVariantsLoader: DataLoader<number, Issue[]>;
}

const canRunProtectedMutation = rule({ cache: 'contextual' })(
  async (_, __, context: Context, info?: { fieldName?: string }) => {
    if (info?.fieldName === 'reportError') {
      return true;
    }

  if (!context.loggedIn) {
    return new GraphQLError('Du bist nicht eingeloggt', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  if (context.operationName === 'Logout') {
    return true;
  }

  if (!CSRF_PROTECTION_ENABLED) return true;

  if (!context.request || !isRequestCsrfValid(context.request)) {
    return new GraphQLError('Ungültiges CSRF-Token', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  return true;
  },
);

const permissions = shield(
  {
    Mutation: {
      login: allow,
      _empty: allow,
      '*': canRunProtectedMutation,
    },
  },
  {
    allowExternalErrors: true,
    fallbackRule: allow,
  },
);

const executableSchema = makeExecutableSchema({
  typeDefs,
  resolvers: mockModeEnabled ? merge({}, ScalarResolvers, mockResolvers) : resolvers,
});

const schema = mockModeEnabled ? executableSchema : applyMiddleware(executableSchema, permissions);

const server = new ApolloServer<Context>({
  schema,
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
  const isProduction = process.env.NODE_ENV === 'production';
  const { secure, domain } = resolveCookieSecurity();
  validateStartupSecurityConfiguration(isProduction, secure);

  const app = express();
  const httpServer = http.createServer(app);

  if ((process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
    app.set('trust proxy', 1);
  }

  const isOriginAllowed = (origin: string | undefined): boolean => {
    if (CORS_ALLOW_ALL_ORIGINS) return true;
    if (!origin) return true;
    return allowedCorsOrigins.includes(origin);
  };

  const allowedCorsHeaders = [
    'content-type',
    ...(CSRF_PROTECTION_ENABLED ? [CSRF_HEADER_NAME] : []),
  ];
  const corsMiddleware = cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
      callback(null, isOriginAllowed(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: allowedCorsHeaders,
    optionsSuccessStatus: 204,
  });

  const SequelizeStore = connectSessionSequelize(session.Store);
  const sessionStore = new SequelizeStore({
    db: models.sequelize,
    tableName: SESSION_STORE_TABLE,
    expiration: SESSION_TTL_SECONDS * 1000,
    checkExpirationInterval: 15 * 60 * 1000,
  });
  await sessionStore.sync();

  app.use(cookieParser());
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        path: '/',
        maxAge: SESSION_TTL_SECONDS * 1000,
        httpOnly: true,
        sameSite: sessionCookieSameSite,
        secure,
        domain,
      },
    }),
  );

  app.use('/', (req: Request, res: Response, next: NextFunction) => {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    if (isOriginAllowed(origin)) {
      next();
      return;
    }
    res.status(403).send('CORS origin denied');
  });

  app.use('/', corsMiddleware);

  app.use('/', (req: Request, res: Response, next: NextFunction) => {
    if (req.method.toUpperCase() === 'OPTIONS') {
      next();
      return;
    }
    if (req.method.toUpperCase() === 'POST') {
      next();
      return;
    }
    res.setHeader('Allow', 'POST,OPTIONS');
    res.status(405).send('Method not allowed');
  });

  server.addPlugin(ApolloServerPluginDrainHttpServer({ httpServer }));
  await server.start();

  app.use('/', express.json({ limit: GRAPHQL_BODY_LIMIT_BYTES }));

  app.use(
    '/',
    expressMiddleware(server, {
      context: async ({ req, res }): Promise<Context> => {
        const requestBody = req.body as GraphQLRequestBody;
        const rawOperationName = requestBody?.operationName;
        const operationName = rawOperationName || 'UNKNOWN';
        const requestId = randomBytes(8).toString('hex');
        const now = new Date();
        const requestIp = parseRequestIp(req);
        logger.info(`[>>>] [${operationName.toUpperCase()}]`, { requestId });

        if (mockModeEnabled) {
          return {
            loggedIn: true,
            authenticatedUserId: undefined,
            requestIp,
            operationName,
            requestId,
            now,
            request: req,
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
            issueVariantsLoader: {} as DataLoader<number, Issue[]>,
          };
        }

        const authorization =
          typeof req.headers.authorization === 'string'
            ? req.headers.authorization
            : req.headers.authorization?.[0];

        if (authorization) {
          throw new GraphQLError('Authorization-Header Sessions werden nicht unterstützt', {
            extensions: { code: 'BAD_USER_INPUT' },
          });
        }

        const sessionWithUserId = req.session as
          | (typeof req.session & { userId?: number })
          | undefined;
        const authenticatedUserId = resolveAuthenticatedUserId(sessionWithUserId?.userId);
        const loggedIn = Boolean(authenticatedUserId);

        if (loggedIn && CSRF_PROTECTION_ENABLED) {
          const csrfTokenInCookie = req.cookies?.[CSRF_COOKIE_NAME];
          if (typeof csrfTokenInCookie !== 'string' || csrfTokenInCookie.length === 0) {
            issueCsrfToken(req, res);
          }
        }

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
        const issueVariantsLoader = new DataLoader<number, Issue[]>((ids) =>
          issueService.getVariantsByIssueIds(ids),
        );

        const contextBase = {
          loggedIn,
          authenticatedUserId,
          requestIp,
          operationName,
          requestId,
          now,
          request: req,
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
          issueVariantsLoader,
        };
        return contextBase;
      },
    }),
  );

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      (error as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).send('Payload too large');
      return;
    }

    if (error instanceof SyntaxError) {
      res.status(400).send('Invalid JSON payload');
      return;
    }

    logger.error('Unhandled GraphQL transport error', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, resolve);
  });

  const url = `http://localhost:${port}/`;
  return { url, server };
};

export default server;
