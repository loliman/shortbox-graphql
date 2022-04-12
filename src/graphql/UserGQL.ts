import {User} from '../database/User';
import {gql} from 'apollo-server';

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
  /*TODO
    Mutation: {
        login: async (_, {user}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (loggedIn)
                    throw new Error("Du bist bereits eingeloggt");

                var sessionid = "";
                var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?%.,;:-_&$(){}[]";

                for (var i = 0; i < 255; i++)
                    sessionid += possible.charAt(Math.floor(Math.random() * possible.length));

                let res = await models.OldUser.update(
                    {sessionid: sessionid},
                    {where: {name: user.name.trim(), password: user.password}},
                    transaction
                );

                if (res[0] === 0)
                    throw new Error();

                await transaction.commit();
                return {id: res[0], sessionid: sessionid};
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        },
        logout: async (_, {user}, context) => {
            const {loggedIn, transaction} = context;

            try {
                if (!loggedIn)
                    throw new Error("Du bist nicht eingeloggt");

                let res = await models.OldUser.update(
                    {sessionid: null},
                    {where: {id: user.id, sessionid: user.sessionid}},
                    transaction
                );

                await transaction.commit();
                return res[0] !== 0;
            } catch (e) {
                await transaction.rollback();
                throw e;
            }
        }
    },*/
};
