import { GraphQLError } from 'graphql';

export const resolvers = {
  Mutation: {
    login: async (_: any, { user }: any, { transaction, models, loggedIn }: any) => {
      if (loggedIn)
        throw new GraphQLError('Du bist bereits eingeloggt', {
          extensions: { code: 'BAD_USER_INPUT' },
        });

      let sessionid = '';
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 64; i++)
        sessionid += possible.charAt(Math.floor(Math.random() * possible.length));

      // Hier sollte in Zukunft bcrypt für Passwörter genutzt werden!
      let userRecord = await models.User.findOne({
        where: { name: user.name.trim(), password: user.password },
        transaction,
      });

      if (!userRecord)
        throw new GraphQLError('Login fehlgeschlagen', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      userRecord.sessionid = sessionid;
      await userRecord.save({ transaction });

      await transaction.commit();
      return userRecord;
    },
    logout: async (_: any, { user }: any, { loggedIn, transaction, models }: any) => {
      if (!loggedIn)
        throw new GraphQLError('Du bist nicht eingeloggt', {
          extensions: { code: 'UNAUTHENTICATED' },
        });

      let [affectedCount] = await models.User.update(
        { sessionid: null },
        { where: { id: user.id, sessionid: user.sessionid }, transaction },
      );

      await transaction.commit();
      return affectedCount !== 0;
    },
  },
  User: {
    id: (parent: any) => parent.id,
    sessionid: (parent: any) => parent.sessionid,
  },
};
