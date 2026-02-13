"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Mutation {
    deletePublisher(item: PublisherInput!): Boolean
    createPublisher(item: PublisherInput!): Publisher
    editPublisher(old: PublisherInput!, item: PublisherInput!): Publisher
  }

  extend type Query {
    publishers(
      pattern: String
      us: Boolean!
      first: Int
      after: String
      filter: Filter
    ): PublisherConnection
    publisher(publisher: PublisherInput!): Publisher
  }

  type PublisherConnection {
    edges: [PublisherEdge]
    pageInfo: PageInfo!
  }

  type PublisherEdge {
    cursor: String!
    node: Publisher
  }

  input PublisherInput {
    id: String
    name: String
    us: Boolean
    addinfo: String
    startyear: Int
    endyear: Int
  }

  type Publisher {
    id: ID
    name: String
    series: [Series]
    us: Boolean
    seriesCount: Int
    issueCount: Int
    lastEdited(limit: Int): [Issue]
    firstIssue: Issue
    lastIssue: Issue
    active: Boolean
    startyear: Int
    endyear: Int
    addinfo: String
  }
`;
