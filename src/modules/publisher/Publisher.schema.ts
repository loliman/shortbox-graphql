import gql from 'graphql-tag';

export const typeDef = gql`
  extend type Mutation {
    deletePublisher(item: PublisherInput!): Boolean
    createPublisher(item: PublisherInput!): Publisher
    editPublisher(old: PublisherInput!, item: PublisherInput!): Publisher
  }

  extend type Query {
    publisherList(
      pattern: String
      us: Boolean!
      first: Int
      after: String
      filter: Filter
    ): PublisherConnection
    publisherDetails(publisher: PublisherInput!): Publisher
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
    active: Boolean
    startyear: Int
    endyear: Int
    addinfo: String
  }
`;
