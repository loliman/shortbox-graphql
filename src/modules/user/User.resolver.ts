import { UserService } from '../../services/UserService';
import { GraphQLError } from 'graphql';
import { UserResolvers } from '../../types/graphql';
import { UserInputSchema } from '../../types/schemas';
import { Transaction } from 'sequelize';
import type { ServerResponse } from 'http';

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'sb_session';
const parsedMaxAge = parseInt(process.env.SESSION_COOKIE_MAX_AGE_SECONDS || '1209600', 10);
const SESSION_COOKIE_MAX_AGE_SECONDS = Number.isFinite(parsedMaxAge) ? parsedMaxAge : 1209600;

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
  const secure = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  if (domain) parts.push(`Domain=${domain}`);
  return parts.join('; ');
};

const buildExpiredSessionCookie = () => {
  const secure = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
  const domain = process.env.SESSION_COOKIE_DOMAIN?.trim();
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
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
    login: async (_, { user }, { transaction, loggedIn, userService, response }) => {
      if (loggedIn)
        throw new GraphQLError('Du bist bereits eingeloggt', {
          extensions: { code: 'BAD_USER_INPUT' },
        });

      let tx: Transaction | undefined;
      let committed = false;
      try {
        tx = requireTransaction(transaction);
        UserInputSchema.parse(user);
        let userRecord = await userService.login(user, tx);

        if (!userRecord) {
          throw new GraphQLError('Login fehlgeschlagen', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await tx.commit();
        committed = true;
        appendSetCookie(response, buildSessionCookie(`${userRecord.id}:${userRecord.sessionid || ''}`));
        return userRecord;
      } catch (e) {
        if (tx && !committed) await tx.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    logout: async (
      _,
      { user },
      { loggedIn, transaction, userService, authenticatedUserId, authenticatedSessionId, response },
    ) => {
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      let tx: Transaction | undefined;
      let committed = false;
      try {
        tx = requireTransaction(transaction);
        UserInputSchema.parse(user);
        const userId = authenticatedUserId || (user.id ? Number(user.id) : undefined);
        const sessionid = authenticatedSessionId || user.sessionid || undefined;
        if (!userId || !sessionid) {
          throw new GraphQLError('Ungültige Session', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        let success = await userService.logout(
          {
            id: userId,
            sessionid,
          },
          tx,
        );

        await tx.commit();
        committed = true;
        if (success) appendSetCookie(response, buildExpiredSessionCookie());
        return !!success;
      } catch (e) {
        if (tx && !committed) await tx.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
  },
  User: {
    id: (parent) => String(parent.id),
    sessionid: (parent) => parent.sessionid || '',
  },
};
