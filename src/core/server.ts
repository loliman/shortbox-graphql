import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';
import { merge } from 'lodash';
import models from '../models';
import { createContext, EXPECTED_OPTIONS_KEY } from 'dataloader-sequelize';
import { resolver } from 'graphql-sequelize';

// Import New Modular Schemas and Resolvers
import { typeDef as PublisherTypeDef } from '../modules/publisher/Publisher.schema';
import { resolvers as PublisherResolvers } from '../modules/publisher/Publisher.resolver';
import { typeDef as SeriesTypeDef } from '../modules/series/Series.schema';
import { resolvers as SeriesResolvers } from '../modules/series/Series.resolver';
import { typeDef as IssueTypeDef } from '../modules/issue/Issue.schema';
import { resolvers as IssueResolvers } from '../modules/issue/Issue.resolver';
import { typeDef as StoryTypeDef } from '../modules/story/Story.schema';
import { resolvers as StoryResolvers } from '../modules/story/Story.resolver';
import { typeDef as CoverTypeDef } from '../modules/cover/Cover.schema';
import { resolvers as CoverResolvers } from '../modules/cover/Cover.resolver';
import { typeDef as ArcTypeDef } from '../modules/arc/Arc.schema';
import { resolvers as ArcResolvers } from '../modules/arc/Arc.resolver';
import { typeDef as IndividualTypeDef } from '../modules/individual/Individual.schema';
import { resolvers as IndividualResolvers } from '../modules/individual/Individual.resolver';
import { typeDef as AppearanceTypeDef } from '../modules/appearance/Appearance.schema';
import { resolvers as AppearanceResolvers } from '../modules/appearance/Appearance.resolver';
import { typeDef as UserTypeDef } from '../modules/user/User.schema';
import { resolvers as UserResolvers } from '../modules/user/User.resolver';
import { typeDef as FeatureTypeDef } from '../modules/feature/Feature.schema';
import { resolvers as FeatureResolvers } from '../modules/feature/Feature.resolver';

// Import remaining TypeDefs/Resolvers (now in api/)
import { resolvers as NodeResolvers, typeDef as NodeTypeDefs } from '../api/Node';
import { resolvers as FilterResolvers, typeDef as FilterTypeDefs } from '../api/Filter';
import { resolvers as ScalarResolvers, typeDef as ScalarTypeDefs } from '../api/generic';

resolver.contextToOptions = { dataloader: EXPECTED_OPTIONS_KEY };

const typeDefs = [
  ScalarTypeDefs,
  NodeTypeDefs,
  FilterTypeDefs,
  UserTypeDef,
  PublisherTypeDef,
  SeriesTypeDef,
  IssueTypeDef,
  StoryTypeDef,
  CoverTypeDef,
  ArcTypeDef,
  IndividualTypeDef,
  AppearanceTypeDef,
  FeatureTypeDef,
];

const resolvers = merge(
  ScalarResolvers,
  NodeResolvers,
  FilterResolvers,
  UserResolvers,
  PublisherResolvers,
  SeriesResolvers,
  IssueResolvers,
  StoryResolvers,
  CoverResolvers,
  ArcResolvers,
  IndividualResolvers,
  AppearanceResolvers,
  FeatureResolvers,
);

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (formattedError, error) => {
    // Return a safe error object to avoid Apollo Server internal crash
    return {
      ...formattedError,
      message: formattedError.message || 'Internal server error',
      extensions: {
        ...formattedError.extensions,
        code: formattedError.extensions?.code || 'INTERNAL_SERVER_ERROR',
      },
    };
  },
  plugins: [
    {
      async requestDidStart(requestContext) {
        return {
          async willSendResponse(requestContext) {
            const { response, contextValue } = requestContext;
            if (!contextValue || !(contextValue as any).now) return;
            let now = new Date();
            let took = (now.getTime() - (contextValue as any).now.getTime()) / 1000;
            console.log(
              '[' +
                new Date().toUTCString() +
                '] [<<<] [' +
                ((contextValue as any).operationName || 'UNKNOWN').toUpperCase() +
                '] took ' +
                took +
                ' seconds',
            );
          },
        };
      },
    },
  ],
});

export const startServer = async (port = 4000) => {
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }: any) => {
      let operationName = req.body.operationName || 'UNKNOWN';
      let now = new Date();
      console.log('[' + now.toUTCString() + '] [>>>] [' + operationName.toUpperCase() + ']');

      let loggedIn = false;
      if (req.headers.authorization) {
        let auth = req.headers.authorization;
        if (auth.startsWith('Bearer ')) {
          auth = auth.substring(7);
        }

        let [userid, sessionid] = auth.split(/:(.+)/);
        if (userid && sessionid) {
          userid = userid.trim().replace(/^"|"$/g, '');
          sessionid = sessionid.trim().replace(/^"|"$/g, '');
          let user = await models.User.findOne({
            where: { id: parseInt(userid, 10) || 0, sessionid: sessionid },
          });
          if (user) loggedIn = true;
        }

        if (!loggedIn)
          throw new GraphQLError('Ungültige Session', {
            extensions: { code: 'UNAUTHENTICATED' },
          } as any);
      }

      // Workaround for dataloader-sequelize with Sequelize v6
      // We create a proxy for the sequelize instance to trick dataloader-sequelize into thinking it's v5
      const { Model, Association } = require('sequelize');
      const sequelizeProxy = new Proxy(models.sequelize, {
        get(target, prop) {
          if (prop === 'constructor') {
            return new Proxy(target.constructor, {
              get(ctorTarget, ctorProp) {
                if (ctorProp === 'version') return '5.0.0';
                if (ctorProp === 'Model') {
                  const M = Model;
                  if (!M.findById) M.findById = M.findByPk;
                  if (!M.findByPrimary) M.findByPrimary = M.findByPk;
                  return M;
                }
                if (ctorProp === 'Association') return Association;
                return (ctorTarget as any)[ctorProp];
              },
            });
          }
          return (target as any)[prop];
        },
      });

      const dataloader = createContext(sequelizeProxy);
      let isMutation = req.body.query && req.body.query.trim().startsWith('mutation');

      const contextBase = { loggedIn, dataloader, operationName, now, models };

      if (isMutation) {
        const transaction = await models.sequelize.transaction();
        return { ...contextBase, transaction };
      }
      return contextBase;
    },
    listen: { port },
  });
  return { url, server };
};

export default server;
