import { LoginRateLimitError, UserService } from '../../services/UserService';
import { GraphQLError } from 'graphql';
import { UserResolvers } from '../../types/graphql';
import { LoginInputSchema } from '../../types/schemas';
import { Transaction } from 'sequelize';
import type { ServerResponse } from 'http';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sb_session';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'sb_csrf';
const parsedMaxAge = parseInt(process.env.SESSION_COOKIE_MAX_AGE_SECONDS || '1209600', 10);
const SESSION_COOKIE_MAX_AGE_SECONDS = Number.isFinite(parsedMaxAge) ? parsedMaxAge : 1209600;
const parsedCsrfMaxAge = parseInt(
  process.env.CSRF_COOKIE_MAX_AGE_SECONDS || String(SESSION_COOKIE_MAX_AGE_SECONDS),
  10,
);
const CSRF_COOKIE_MAX_AGE_SECONDS = Number.isFinite(parsedCsrfMaxAge)
  ? parsedCsrfMaxAge
  : SESSION_COOKIE_MAX_AGE_SECONDS;
const SESSION_COOKIE_SAME_SITE = (() => {
  const configured = (process.env.SESSION_COOKIE_SAME_SITE || 'lax').trim().toLowerCase();
  if (configured === 'strict') return 'Strict';
  if (configured === 'none') return 'None';
  return 'Lax';
})();

const appendSetCookie = (response: ServerResponse | undefined, cookieValue: string) => {
  if (!response) return;
  const existing = response.getHeader('Set-Cookie');
  if (!existing) {
    response.setHeader('Set-Cookie', [cookieValue]);
    return;
  }

  const current = Array.isArray(existing) ? existing.map(String) : [String(existing)];
  response.setHeader('Set-Cookie', [...current, cookieValue]);
};

const buildSessionCookie = (token: string) => {
  const secureByEnv = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = SESSION_COOKIE_SAME_SITE === 'None' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const buildExpiredSessionCookie = () => {
  const secureByEnv = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = SESSION_COOKIE_SAME_SITE === 'None' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const buildCsrfCookie = (token: string) => {
  const secureByEnv = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = SESSION_COOKIE_SAME_SITE === 'None' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${CSRF_COOKIE_MAX_AGE_SECONDS}`,
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const buildExpiredCsrfCookie = () => {
  const secureByEnv = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const secure = SESSION_COOKIE_SAME_SITE === 'None' ? true : secureByEnv;
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${CSRF_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    `SameSite=${SESSION_COOKIE_SAME_SITE}`,
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const requireTransaction = (transaction: Transaction | undefined): Transaction => {
  if (!transaction) {
    throw new GraphQLError('Transaktion konnte nicht erstellt werden', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }
  return transaction;
};

export const resolvers: UserResolvers = {
  Query: {
    me: async (_, __, { loggedIn, authenticatedUserId, models }) => {
      if (!loggedIn || !authenticatedUserId) return null;
      return await models.User.findByPk(authenticatedUserId);
    },
  },
  Mutation: {
    login: async (_, { credentials }, { transaction, loggedIn, userService, response, requestIp }) => {
      if (loggedIn)
        throw new GraphQLError('Du bist bereits eingeloggt', {
          extensions: { code: 'BAD_USER_INPUT' },
        });

      let tx: Transaction | undefined;
      let committed = false;
      try {
        tx = requireTransaction(transaction);
        LoginInputSchema.parse(credentials);
        let loginResult = await userService.login(credentials, tx, requestIp);

        if (!loginResult) {
          throw new GraphQLError('Login fehlgeschlagen', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await tx.commit();
        committed = true;
        appendSetCookie(response, buildSessionCookie(loginResult.sessionToken));
        appendSetCookie(response, buildCsrfCookie(loginResult.csrfToken));
        return loginResult.userRecord;
      } catch (e) {
        if (tx && !committed) await tx.rollback();
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
      { loggedIn, transaction, userService, authenticatedUserId, authenticatedSessionTokenHash, response },
    ) => {
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      let tx: Transaction | undefined;
      let committed = false;
      try {
        tx = requireTransaction(transaction);
        const userId = authenticatedUserId;
        const sessionTokenHash = authenticatedSessionTokenHash;
        if (!userId || !sessionTokenHash) {
          throw new GraphQLError('Ungültige Session', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        let success = await userService.logout(userId, sessionTokenHash, tx);

        await tx.commit();
        committed = true;
        if (success) {
          appendSetCookie(response, buildExpiredSessionCookie());
          appendSetCookie(response, buildExpiredCsrfCookie());
        }
        return !!success;
      } catch (e) {
        if (tx && !committed) await tx.rollback();
        throw e;
      }
    },
  },
  User: {
    id: (parent) => String(parent.id),
  },
};
