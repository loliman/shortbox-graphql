import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    deletePublisher(item: PublisherInput!): Boolean
    createPublisher(item: PublisherInput!): Publisher
    editPublisher(old: PublisherInput!, item: PublisherInput!): Publisher
  }

  extend type Query {
    publishers(pattern: String, us: Boolean!, offset: Int, limit: Int, filter: Filter): [Publisher]
    publisher(publisher: PublisherInput!): Publisher
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
