import gql from 'graphql-tag';
import { DateResolver, DateTimeResolver } from 'graphql-scalars';

export const typeDef = gql`
  scalar Date
  scalar DateTime

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type Mutation {
    _empty: String
  }

  type Query {
    _empty: String
  }
`;

export const resolvers = {
  Date: DateResolver,
  DateTime: DateTimeResolver,
};
