"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const graphql_1 = require("graphql");
const schemas_1 = require("../../types/schemas");
exports.resolvers = {
    Mutation: {
        login: async (_, { user }, { transaction, loggedIn, userService }) => {
            if (loggedIn)
                throw new graphql_1.GraphQLError('Du bist bereits eingeloggt', {
                    extensions: { code: 'BAD_USER_INPUT' },
                });
            try {
                schemas_1.UserInputSchema.parse(user);
                let userRecord = await userService.login(user, transaction);
                if (!userRecord) {
                    await transaction.rollback();
                    throw new graphql_1.GraphQLError('Login fehlgeschlagen', {
                        extensions: { code: 'UNAUTHENTICATED' },
                    });
                }
                await transaction.commit();
                return userRecord;
            }
            catch (e) {
                if (transaction)
                    await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
                }
                throw e;
            }
        },
        logout: async (_, { user }, { loggedIn, transaction, userService }) => {
            if (!loggedIn)
                throw new graphql_1.GraphQLError('Du bist nicht eingeloggt', {
                    extensions: { code: 'UNAUTHENTICATED' },
                });
            try {
                schemas_1.UserInputSchema.parse(user);
                let success = await userService.logout(user, transaction);
                await transaction.commit();
                return !!success;
            }
            catch (e) {
                if (transaction)
                    await transaction.rollback();
                if (e instanceof Error && e.name === 'ZodError') {
                    throw new graphql_1.GraphQLError(e.message, { extensions: { code: 'BAD_USER_INPUT' } });
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
