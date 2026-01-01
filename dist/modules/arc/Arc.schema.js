"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Query {
    arcs(pattern: String, type: String, first: Int, after: String): ArcConnection
  }

  type ArcConnection {
    edges: [ArcEdge]
    pageInfo: PageInfo!
  }

  type ArcEdge {
    cursor: String!
    node: Arc
  }

  input ArcInput {
    id: String
    title: String
    type: String
  }

  type Arc {
    id: ID
    title: String
    type: String
    issues: [Issue]
  }
`;
