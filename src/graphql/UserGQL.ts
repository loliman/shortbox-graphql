import {User} from '../database/User';
import {AuthenticationError, gql} from 'apollo-server';
import {Context} from 'vm';
import {knex} from '../core/database';

export const typeDef = gql`
  extend type Mutation {
    login(user: UserInput!): User
    logout(user: UserInput!): Boolean
  }

  input UserInput {
    id: Int
    name: String
    password: String
    sessionid: String
  }

  type User {
    id: Int
    sessionid: String
  }
`;

export const resolvers = {
  User: {
    id: (parent: User): number => parent.id,
    sessionid: (parent: User): string => parent.sessionid,
  },
  Mutation: {
    login: async (_: any, parent: any, context: Context) => {
      const {loggedIn, transaction} = context;

      try {
        if (loggedIn) throw new Error('Du bist bereits eingeloggt');

        let user: User = await User.query(transaction).findOne({
          name: parent.user.name,
        });

        if (user === null) throw new AuthenticationError('Unbekannter User');

        var sessionid = '';
        var possible =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,;:-_&$(){}[]';

        for (var i = 0; i < 255; i++)
          sessionid += possible.charAt(
            Math.floor(Math.random() * possible.length)
          );

        let res: User = await user
          .$query()
          .patchAndFetch({sessionid: sessionid})
          .where({
            name: parent.user.name.trim(),
            password: parent.user.password,
          });

        if (res === null) throw new Error();

        await transaction.commit();
        return {id: res.id, sessionid: res.sessionid};
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
    logout: async (_: any, parent: any, context: Context) => {
      const {loggedIn, transaction} = context;

      try {
        if (!loggedIn) throw new Error('Du bist nicht eingeloggt');

        let res: number = await User.query(transaction)
          .patch({sessionid: undefined})
          .where({
            id: parent.user.id,
            sessionid: parent.user.sessionid,
          });

        await transaction.commit();
        return res !== 0;
      } catch (e) {
        await transaction.rollback();
        throw e;
      }
    },
  },
};
