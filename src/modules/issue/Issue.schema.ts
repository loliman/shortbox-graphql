import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    deleteIssue(item: IssueInput!): Boolean
    createIssue(item: IssueInput!): Issue
    editIssue(old: IssueInput!, item: IssueInput!): Issue
  }

  extend type Query {
    issueList(
      pattern: String
      series: SeriesInput!
      first: Int
      after: String
      filter: Filter
    ): IssueConnection
    issueDetails(issue: IssueInput!, edit: Boolean): Issue
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
    createdat: DateTime
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
