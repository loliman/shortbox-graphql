import {gql} from 'apollo-server';
import {GraphQLScalarType, Kind} from 'graphql';

const dateFormat = require('dateformat');

export const typeDef = gql`
  scalar Date
  scalar DateTime
  scalar ValidateString
  scalar ValidateNumber

  directive @constraint(
    # String constraints
    minLength: Int
    maxLength: Int
    startsWith: String
    endsWith: String
    notContains: String
    pattern: String
    format: String

    # Number constraints
    min: Int
    max: Int
    exclusiveMin: Int
    exclusiveMax: Int
    multipleOf: Int
  ) on INPUT_FIELD_DEFINITION

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
    parseValue(value) {
      return new Date(value);
    },
    serialize(value) {
      if (typeof value !== typeof String) value = value.toLocaleString();

      if (!value || value.indexOf('-00') !== -1) value = '1900-01-01';

      try {
        return dateFormat(new Date(value), 'yyyy-mm-dd');
      } catch (e) {
        return dateFormat(new Date('1900-01-01'), 'yyyy-mm-dd');
      }
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10);
      }
      return null;
    },
  }),
  DateTime: new GraphQLScalarType({
    name: 'DateTime',
    description: 'DateTime custom scalar type',
    serialize(value) {
      return dateFormat(new Date(value.toString()), 'dd.mm.yyyy HH:MM');
    },
  }),
};
