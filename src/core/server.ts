import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';
import { merge } from 'lodash';
import models from '../models';
import DataLoader from 'dataloader';
import { resolver } from 'graphql-sequelize';
import logger from '../util/logger';

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

import { DbModels } from '../types/db';
import { PublisherService } from '../services/PublisherService';
import { SeriesService } from '../services/SeriesService';
import { IssueService } from '../services/IssueService';
import { UserService } from '../services/UserService';
import { FilterService } from '../services/FilterService';
import { StoryService } from '../services/StoryService';

import { Publisher } from '../modules/publisher/Publisher.model';
import { Series } from '../modules/series/Series.model';
import { Issue } from '../modules/issue/Issue.model';
import { Story } from '../modules/story/Story.model';

// resolver.contextToOptions = { dataloader: EXPECTED_OPTIONS_KEY };

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
            const { contextValue } = requestContext;
            if (!contextValue || !(contextValue as any).now) return;
            let now = new Date();
            let took = (now.getTime() - (contextValue as any).now.getTime()) / 1000;
            logger.info(
              `[<<<] [${(
                (contextValue as any).operationName || 'UNKNOWN'
              ).toUpperCase()}] took ${took} seconds`,
              { requestId: (contextValue as any).requestId },
            );
          },
        };
      },
    },
  ],
});

export interface Context {
  loggedIn: boolean;
  operationName: string;
  requestId: string;
  now: Date;
  models: DbModels;
  transaction?: any;
  publisherService: PublisherService;
  seriesService: SeriesService;
  issueService: IssueService;
  userService: UserService;
  filterService: FilterService;
  storyService: StoryService;
  publisherLoader: DataLoader<number, Publisher | null>;
  seriesLoader: DataLoader<number, Series | null>;
  issueLoader: DataLoader<number, Issue | null>;
  storyLoader: DataLoader<number, Story | null>;
}

export const startServer = async (port = parseInt(process.env.PORT || '4000', 10)) => {
  const { url } = await startStandaloneServer(server, {
    context: async ({ req }: any): Promise<Context> => {
      let operationName = req.body.operationName || 'UNKNOWN';
      let requestId = Math.random().toString(36).substring(2, 15);
      let now = new Date();
      logger.info(`[>>>] [${operationName.toUpperCase()}]`, { requestId });

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

      let isMutation = req.body.query && req.body.query.trim().startsWith('mutation');

      const publisherService = new PublisherService(models, requestId);
      const seriesService = new SeriesService(models, requestId);
      const issueService = new IssueService(models, requestId);
      const userService = new UserService(models, requestId);
      const filterService = new FilterService(models, requestId);
      const storyService = new StoryService(models, requestId);

      const publisherLoader = new DataLoader<number, Publisher | null>((ids) => publisherService.getPublishersByIds(ids));
      const seriesLoader = new DataLoader<number, Series | null>((ids) => seriesService.getSeriesByIds(ids));
      const issueLoader = new DataLoader<number, Issue | null>((ids) => issueService.getIssuesByIds(ids));
      const storyLoader = new DataLoader<number, Story | null>((ids) => storyService.getStoriesByIds(ids));

      const contextBase = {
        loggedIn,
        operationName,
        requestId,
        now,
        models,
        publisherService,
        seriesService,
        issueService,
        userService,
        filterService,
        storyService,
        publisherLoader,
        seriesLoader,
        issueLoader,
        storyLoader,
      };

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
