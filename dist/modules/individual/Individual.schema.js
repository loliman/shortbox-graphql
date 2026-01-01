"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Query {
    individuals(pattern: String, first: Int, after: String): IndividualConnection
  }

  type IndividualConnection {
    edges: [IndividualEdge]
    pageInfo: PageInfo!
  }

  type IndividualEdge {
    cursor: String!
    node: Individual
  }

  input IndividualInput {
    name: String
    type: [String]
  }

  type Individual {
    id: ID
    name: String
    type: [String]
  }
`;
