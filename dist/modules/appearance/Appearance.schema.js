"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Query {
    apps(pattern: String, type: String, first: Int, after: String): AppearanceConnection
  }

  type AppearanceConnection {
    edges: [AppearanceEdge]
    pageInfo: PageInfo!
  }

  type AppearanceEdge {
    cursor: String!
    node: Appearance
  }

  input AppearanceInput {
    id: String
    name: String
    type: String
    role: String
  }

  type Appearance {
    id: ID
    name: String
    type: String
    role: String
  }
`;
