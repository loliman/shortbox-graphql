import { UserService } from '../../services/UserService';
import { GraphQLError } from 'graphql';
import { UserResolvers } from '../../types/graphql';
import { UserInputSchema } from '../../types/schemas';

export const resolvers: UserResolvers = {
  Mutation: {
    login: async (_, { user }, { transaction, loggedIn, userService }) => {
      if (loggedIn)
        throw new GraphQLError('Du bist bereits eingeloggt', {
          extensions: { code: 'BAD_USER_INPUT' },
        });

      try {
        UserInputSchema.parse(user);
        let userRecord = await userService.login(user, transaction);

        if (!userRecord) {
          await transaction.rollback();
          throw new GraphQLError('Login fehlgeschlagen', {
            extensions: { code: 'UNAUTHENTICATED' },
          });
        }

        await transaction.commit();
        return userRecord as any;
      } catch (e) {
        if (transaction) await transaction.rollback();
        if (e instanceof Error && e.name === 'ZodError') {
          throw new GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
        }
        throw e;
      }
    },
    logout: async (_, { user }, { loggedIn, transaction, userService }) => {
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      try {
        UserInputSchema.parse(user);
        let success = await userService.logout(user, transaction);

        await transaction.commit();
        return !!success;
      } catch (e) {
        if (transaction) await transaction.rollback();
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
