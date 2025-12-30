import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    deleteIssue(item: IssueInput!): Boolean
    createIssue(item: IssueInput!): Issue
    editIssue(old: IssueInput!, item: IssueInput!): Issue
    crawlIssue(number: String!, title: String!, volume: Int!): Issue
    uploadCover(file: Upload!, issue: IssueInput!): Boolean
  }

  extend type Query {
    issues(pattern: String, series: SeriesInput!, offset: Int, limit: Int, filter: Filter): [Issue]
    issue(issue: IssueInput!, edit: Boolean): Issue
    lastEdited(filter: Filter, offset: Int, limit: Int, order: String, direction: String): [Issue]
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
