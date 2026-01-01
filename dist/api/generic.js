"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const graphql_1 = require("graphql");
const dateformat_1 = __importDefault(require("dateformat"));
exports.typeDef = (0, graphql_tag_1.default) `
  scalar Date
  scalar DateTime
  scalar Upload

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
exports.resolvers = {
    Date: new graphql_1.GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
            return new Date(value);
        },
        serialize(value) {
            if (typeof value !== 'string')
                value = value.toLocaleString();
            if (!value || value.indexOf('-00') !== -1)
                value = '1900-01-01';
            try {
                value = (0, dateformat_1.default)(new Date(value), 'yyyy-mm-dd');
            }
            catch (e) {
                value = '1900-01-01';
            }
            return value;
        },
        parseLiteral(ast) {
            if (ast.kind === graphql_1.Kind.INT) {
                return new Date(parseInt(ast.value, 10));
            }
            return null;
        },
    }),
    DateTime: new graphql_1.GraphQLScalarType({
        name: 'DateTime',
        description: 'DateTime custom scalar type',
        serialize(value) {
            return (0, dateformat_1.default)(new Date(value.toString()), 'dd.mm.yyyy HH:MM');
        },
    }),
};
