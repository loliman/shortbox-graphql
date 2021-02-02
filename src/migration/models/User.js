import Sequelize, {Model} from 'sequelize';
import {gql} from 'apollo-server';
import models from "./index";

class User extends Model {
    static tableName = 'User';
}

export default (sequelize) => {
    User.init({
        id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true
        },
        name: {
            type: Sequelize.STRING(255),
            allowNull: false
        },
        password: {
            type: Sequelize.STRING,
            allowNull: false
        },
        sessionid: {
            type: Sequelize.STRING,
            allowNull: true
        }
    }, {
        indexes: [{
            unique: true,
            fields: ['name']
        }],
        sequelize,
        tableName: User.tableName
    });

    return User;
};

export const typeDef = gql`
  extend type Mutation {
    login(user: UserInput!): User,
    logout(user: UserInput!): Boolean  
  }
   
  input UserInput {
    id: Int,
    name: String,
    password: String,
    sessionid: String
  }
  
  type User {
    id: ID,
    sessionid: String
  }
`;

export const resolvers = {
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

                let res = await models.User.update(
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

                let res = await models.User.update(
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
    },
    User: {
        id: (parent) => parent.id,
        sessionid: (parent) => parent.sessionid
    }
};