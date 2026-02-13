"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDef = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.typeDef = (0, graphql_tag_1.default) `
  extend type Mutation {
    deleteIssue(item: IssueInput!): Boolean
    createIssue(item: IssueInput!): Issue
    editIssue(old: IssueInput!, item: IssueInput!): Issue
  }

  extend type Query {
    issues(
      pattern: String
      series: SeriesInput!
      first: Int
      after: String
      filter: Filter
    ): IssueConnection
    issue(issue: IssueInput!, edit: Boolean): Issue
    lastEdited(
      filter: Filter
      first: Int
      after: String
      order: String
      direction: String
    ): IssueConnection
  }

  type IssueConnection {
    edges: [IssueEdge]
    pageInfo: PageInfo!
  }

  type IssueEdge {
    cursor: String!
    node: Issue
  }

  input IssueInput {
    id: String
    title: String
    number: String
    format: String
    variant: String
    releasedate: Date
    pages: Int
    price: Float
    currency: String
    isbn: String
    limitation: String
    addinfo: String
    series: SeriesInput
  }

  type Issue {
    id: ID
    title: String
    number: String
    format: String
    variant: String
    releasedate: Date
    pages: Int
    price: Float
    currency: String
    isbn: String
    limitation: String
    addinfo: String
    verified: Boolean
    collected: Boolean
    comicguideid: String
    createdAt: DateTime
    updatedAt: DateTime
    series: Series
    stories: [Story]
    cover: Cover
    covers: [Cover]
    individuals: [Individual]
    arcs: [Arc]
    features: [Feature]
    variants: [Issue]
    tags: [String]
  }
`;
