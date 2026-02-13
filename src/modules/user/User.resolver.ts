import { LoginRateLimitError, UserService } from '../../services/UserService';
import { GraphQLError } from 'graphql';
import { UserResolvers } from '../../types/graphql';
import { LoginInputSchema } from '../../types/schemas';
import { Transaction } from 'sequelize';
import {
  appendSetCookie,
  buildCsrfCookie,
  buildExpiredCsrfCookie,
  buildExpiredSessionCookie,
  buildSessionCookie,
} from './authCookies';

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
