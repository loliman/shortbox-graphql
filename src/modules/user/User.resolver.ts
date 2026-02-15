import { LoginRateLimitError } from '../../services/UserService';
import { GraphQLError } from 'graphql';
import { UserResolvers } from '../../types/graphql';
import { LoginInputSchema } from '../../types/schemas';
import type { Request, Response } from 'express';
import { issueCsrfToken } from '../../core/csrf';
import {
  resolveCookieSecurity,
  SESSION_COOKIE_NAME,
  sessionCookieSameSite,
} from '../../core/cookies';
import { CSRF_COOKIE_NAME } from '../../core/server-config';

const requireRequest = (request: Request | undefined): Request => {
  if (!request) {
    throw new GraphQLError('Request-Kontext fehlt', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }
  return request;
};

const requireResponse = (response: Response | undefined): Response => {
  if (!response) {
    throw new GraphQLError('Response-Kontext fehlt', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }
  return response;
};

const regenerateSession = async (request: Request): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    request.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const saveSession = async (request: Request): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    request.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const destroySession = async (request: Request): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    request.session.destroy((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

export const resolvers: UserResolvers = {
  Query: {
    me: async (_, __, { loggedIn, authenticatedUserId, models }) => {
      if (!loggedIn || !authenticatedUserId) return null;
      return await models.User.findByPk(authenticatedUserId);
    },
  },
  Mutation: {
    login: async (
      _,
      { credentials },
      { loggedIn, models, userService, response, requestIp, request },
    ) => {
      if (loggedIn)
        throw new GraphQLError('Du bist bereits eingeloggt', {
          extensions: { code: 'BAD_USER_INPUT' },
        });

      try {
        LoginInputSchema.parse(credentials);
        const requestObject = requireRequest(request);
        const responseObject = requireResponse(response);
        const loginResult = await models.sequelize.transaction(async (tx) => {
          return await userService.login(credentials, tx, requestIp);
        });

        if (!loginResult) {
          throw new GraphQLError('Login fehlgeschlagen', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await regenerateSession(requestObject);
        const sessionWithUserId = requestObject.session as typeof requestObject.session & {
          userId?: number;
        };
        sessionWithUserId.userId = loginResult.id;
        await saveSession(requestObject);
        issueCsrfToken(requestObject, responseObject, true);
        return loginResult;
      } catch (e) {
        if (e instanceof LoginRateLimitError) {
          if (response) response.setHeader('Retry-After', String(e.retryAfterSeconds));
          throw new GraphQLError('Zu viele Login-Versuche, bitte später erneut versuchen', {
            extensions: {
              code: 'TOO_MANY_REQUESTS',
              retryAfterSeconds: e.retryAfterSeconds,
            },
          });
        }
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    logout: async (
      _,
      __,
      { loggedIn, models, userService, authenticatedUserId, response, request },
    ) => {
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        const requestObject = requireRequest(request);
        const userId = authenticatedUserId;
        if (!userId) {
          throw new GraphQLError('Ungültige Session', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        const success = await models.sequelize.transaction(async (tx) => {
          return await userService.logout(userId, tx);
        });

        if (success) {
          await destroySession(requestObject);
          const responseObject = requireResponse(response);
          const { secure, domain } = resolveCookieSecurity();
          responseObject.clearCookie(SESSION_COOKIE_NAME, {
            path: '/',
            sameSite: sessionCookieSameSite,
            secure,
            domain,
            httpOnly: true,
          });
          responseObject.clearCookie(CSRF_COOKIE_NAME, {
            path: '/',
            sameSite: sessionCookieSameSite,
            secure,
            domain,
          });
        }
        return !!success;
      } catch (e) {
        throw e;
      }
    },
  },
  User: {
    id: (parent) => String((parent as { id: number | string }).id),
  },
};
