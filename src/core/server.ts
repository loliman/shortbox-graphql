import {ApolloServer, AuthenticationError} from 'apollo-server';
const ConstraintDirective = require('apollo-server-constraint-directive');

import {
  resolvers as ArcResolvers,
  typeDef as ArcTypeDefs,
} from '../graphql/ArcGQL';
import {
  resolvers as NodeResolvers,
  typeDef as NodeTypeDefs,
} from '../graphql/Node';
import {
  resolvers as FilterResolvers,
  typeDef as FilterTypeDefs,
} from '../graphql/Filter';
import {
  resolvers as ScalarResolvers,
  typeDef as ScalarTypeDefs,
} from '../graphql/generic';
import {typeDef as AppearanceTypeDefs} from '../graphql/AppearanceGQL';
import {resolvers as AppearanceResolvers} from '../graphql/AppearanceGQL';
import {typeDef as CoverTypeDefs} from '../graphql/CoverGQL';
import {resolvers as CoverResolvers} from '../graphql/CoverGQL';
import {typeDef as FeatureTypeDefs} from '../graphql/FeatureGQL';
import {typeDef as IndividualTypeDefs} from '../graphql/IndividualGQL';
import {typeDef as IssueTypeDefs} from '../graphql/IssueGQL';
import {typeDef as PublisherTypeDefs} from '../graphql/PublisherGQL';
import {typeDef as SeriesTypeDefs} from '../graphql/SeriesGQL';
import {typeDef as StoryTypeDefs} from '../graphql/StoryGQL';
import {typeDef as UserTypeDefs} from '../graphql/UserGQL';
import {resolvers as FeatureResolvers} from '../graphql/FeatureGQL';
import {resolvers as IndividualResolvers} from '../graphql/IndividualGQL';
import {resolvers as IssueResolvers} from '../graphql/IssueGQL';
import {resolvers as PublisherResolvers} from '../graphql/PublisherGQL';
import {resolvers as SeriesResolvers} from '../graphql/SeriesGQL';
import {resolvers as StoryResolvers} from '../graphql/StoryGQL';
import {resolvers as UserResolvers} from '../graphql/UserGQL';
import {knex} from './database';
import {User} from '../database/User';

const server = new ApolloServer({
  typeDefs: [
    ScalarTypeDefs,
    NodeTypeDefs,
    FilterTypeDefs,
    PublisherTypeDefs,
    UserTypeDefs,
    CoverTypeDefs,
    FeatureTypeDefs,
    IndividualTypeDefs,
    AppearanceTypeDefs,
    IssueTypeDefs,
    SeriesTypeDefs,
    StoryTypeDefs,
    ArcTypeDefs,
  ],
  resolvers: [
    ScalarResolvers,
    NodeResolvers,
    FilterResolvers,
    PublisherResolvers,
    UserResolvers,
    CoverResolvers,
    FeatureResolvers,
    IndividualResolvers,
    AppearanceResolvers,
    IssueResolvers,
    SeriesResolvers,
    StoryResolvers,
    ArcResolvers,
  ],
  schemaDirectives: {constraint: ConstraintDirective},
  context: async ({req}) => {
    let loggedIn = false;
    if (req.headers.authorization) {
      let userid = req.headers.authorization.split(/:(.+)/)[0];
      let sessionid = req.headers.authorization.split(/:(.+)/)[1];

      let user: User = await User.query().findOne({
        id: userid,
        sessionid: sessionid,
      });

      if (user === null) throw new AuthenticationError('Ungültige Session');

      loggedIn = true;
    }

    let isMutation = req.body.query.indexOf('mutation') === 0;

    if (isMutation) {
      const transaction = await knex.transaction();
      return {loggedIn, transaction};
    } else {
      return {loggedIn};
    }
  },
  uploads: {
    maxFileSize: 10000000, //10 MB
  },
  formatError: (e: any) => {
    if (
      e.originalError &&
      e.originalError.code === 'ERR_GRAPHQL_CONSTRAINT_VALIDATION'
    ) {
      return e;
    }
    return e;
  },
});

export default server;
