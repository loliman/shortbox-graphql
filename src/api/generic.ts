import gql from 'graphql-tag';
import { GraphQLScalarType, Kind } from 'graphql';
import dateFormat from 'dateformat';

export const typeDef = gql`
  scalar Date
  scalar DateTime
  scalar Upload

  type Mutation {
    _empty: String
  }

  type Query {
    _empty: String
  }
`;

export const resolvers = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value: any) {
      return new Date(value);
    },
    serialize(value: any) {
      if (typeof value !== 'string') value = value.toLocaleString();

      if (!value || value.indexOf('-00') !== -1) value = '1900-01-01';

      try {
        value = dateFormat(new Date(value), 'yyyy-mm-dd');
      } catch (e) {
        value = '1900-01-01';
      }

      return value;
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return new Date(parseInt(ast.value, 10));
      }
      return null;
    },
  }),
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'DateTime custom scalar type',
    serialize(value: any) {
      return dateFormat(new Date(value.toString()), 'dd.mm.yyyy HH:MM');
    },
  }),
};
